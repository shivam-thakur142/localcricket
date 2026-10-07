// ====================================================================
// EXPRESS APPLICATION FACTORY (server/src/app.js)
// ====================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createAuthMiddleware } from './middleware/authMiddleware.js';
import {
  createScorerRbacMiddleware,
  createMatchOrganizerMiddleware,
  createSuperAdminMiddleware,
  createTournamentFreezeGuard,
} from './middleware/rbacMiddleware.js';
import {
  createSecurityHeaders,
  createCorsMiddleware,
  createAuthRateLimiter,
  createScorerRateLimiter,
  createPublicRateLimiter,
  createCompressionMiddleware,
} from './middleware/securityMiddleware.js';
import { createAuthRoutes, createPublicInvitationRoutes } from './routes/authRoutes.js';
import { createAdminRoutes } from './routes/adminRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { ScoringService } from './services/scoringService.js';
import { MatchService } from './services/matchService.js';
import { AnalyticsService } from './services/analyticsService.js';
import { RosterService } from './services/rosterService.js';
import { ScorerController } from './controllers/scorerController.js';
import { MatchController } from './controllers/matchController.js';
import { createScorerRoutes } from './routes/scorerRoutes.js';
import { createMatchRoutes } from './routes/matchRoutes.js';
import { createTournamentRoutes } from './routes/tournamentRoutes.js';
import { ProfileService } from './services/profileService.js';
import { ProfileController } from './controllers/profileController.js';
import { H2HService } from './services/h2hService.js';
import { H2HController } from './controllers/h2hController.js';
import { SchedulerService } from './services/schedulerService.js';
import { OfficialService } from './services/officialService.js';
import { SquadService } from './services/squadService.js';
import { ArchiveService } from './services/archiveService.js';
import { OperationsController } from './controllers/operationsController.js';
import { ApiResponse } from './utils/ApiResponse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(db) {
  const app = express();

  // App-level state
  app.locals.isShuttingDown = false;

  // 1. Security Headers & Payload Controls
  app.use(createSecurityHeaders());
  app.use(createCorsMiddleware());
  app.use(createCompressionMiddleware());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // 2. Health & Readiness Probes
  // Liveness Probe: in-memory, lightweight, zero DB access
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'LocalCricket API',
      uptime_seconds: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness Probe: active DB probe and shutdown verification
  app.get('/ready', async (req, res) => {
    if (app.locals.isShuttingDown) {
      return res.status(503).json({
        status: 'unhealthy',
        error: 'Server is currently shutting down',
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const t0 = Date.now();
      await db.query('SELECT 1;');
      const latencyMs = Date.now() - t0;
      return res.status(200).json({
        status: 'ready',
        database: 'connected',
        latency_ms: latencyMs,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      // SECURITY: Never output connection strings, database usernames, or host details
      return res.status(503).json({
        status: 'unhealthy',
        database: 'disconnected',
        error: 'Database connectivity check failed',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // 3. Domain Services & Controllers
  const scoringService = new ScoringService(db);
  const matchService = new MatchService(db);
  const analyticsService = new AnalyticsService(db);
  const rosterService = new RosterService(db);
  const schedulerService = new SchedulerService(db);
  const officialService = new OfficialService(db);
  const squadService = new SquadService(db);
  const archiveService = new ArchiveService(db);

  const scorerController = new ScorerController(scoringService);
  const matchController = new MatchController(matchService, analyticsService);
  const operationsController = new OperationsController(
    schedulerService,
    officialService,
    squadService,
    archiveService
  );

  const authMiddleware = createAuthMiddleware(db);
  const rbacMiddleware = createScorerRbacMiddleware(db);
  const matchOrganizerMiddleware = createMatchOrganizerMiddleware(db);
  const superAdminMiddleware = createSuperAdminMiddleware(db);
  const freezeGuard = createTournamentFreezeGuard(db);

  const h2hService = new H2HService(db);
  const h2hController = new H2HController(h2hService);

  // 4. Rate Limiters
  const authRateLimiter = createAuthRateLimiter();
  const scorerRateLimiter = createScorerRateLimiter();
  const publicRateLimiter = createPublicRateLimiter();

  // 5. Mount API Routes under /api/v1
  const apiRouter = express.Router();

  // Tier 1: Auth Rate Limiter applied to credential endpoints
  apiRouter.use('/auth/login', authRateLimiter);
  apiRouter.use('/auth/register', authRateLimiter);
  apiRouter.use('/auth/password', authRateLimiter);

  // Tier 2: Scorer Rate Limiter applied to Scorer routes
  apiRouter.use('/scorer', scorerRateLimiter);

  // Tier 3: Public Rate Limiter for general endpoints
  apiRouter.use(publicRateLimiter);

  apiRouter.use('/auth', createAuthRoutes(db, authMiddleware));
  apiRouter.use('/invitations', createPublicInvitationRoutes(db, authMiddleware));
  apiRouter.use('/admin', createAdminRoutes(db, authMiddleware, superAdminMiddleware));
  apiRouter.use('/scorer/matches', createScorerRoutes(scorerController, authMiddleware, rbacMiddleware, freezeGuard));
  apiRouter.use('/matches', createMatchRoutes(matchController, authMiddleware, matchOrganizerMiddleware, h2hController, operationsController, freezeGuard));
  apiRouter.use('/tournaments', createTournamentRoutes(db));

  // Global Teams & Players Endpoints
  const profileService = new ProfileService(db);
  const profileController = new ProfileController(profileService);

  apiRouter.get('/teams', async (req, res, next) => {
    try {
      const teams = await rosterService.listGlobalTeams(req.query);
      ApiResponse.success(teams).send(res);
    } catch (err) {
      next(err);
    }
  });

  apiRouter.post('/teams', authMiddleware, async (req, res, next) => {
    try {
      const team = await rosterService.createGlobalTeam({
        ...req.body,
        created_by_user_id: req.user.id,
      });
      ApiResponse.created(team, 'Team created successfully').send(res);
    } catch (err) {
      next(err);
    }
  });

  apiRouter.get('/teams/:id', profileController.getTeam);
  apiRouter.get('/teams/:id/stats', profileController.getTeamStats);
  apiRouter.get('/teams/:id/roster', profileController.getTeamRoster);
  apiRouter.get('/teams/:id/matches', profileController.getTeamMatches);
  apiRouter.get('/teams/:id/head-to-head', h2hController.getHeadToHead);

  apiRouter.get('/players', async (req, res, next) => {
    try {
      const players = await rosterService.listGlobalPlayers(req.query);
      ApiResponse.success(players).send(res);
    } catch (err) {
      next(err);
    }
  });

  apiRouter.post('/players', authMiddleware, async (req, res, next) => {
    try {
      const player = await rosterService.createGlobalPlayer(req.body);
      ApiResponse.created(player, 'Player created successfully').send(res);
    } catch (err) {
      next(err);
    }
  });

  apiRouter.get('/players/:id', profileController.getPlayer);
  apiRouter.get('/players/:id/stats', profileController.getPlayerStats);
  apiRouter.get('/players/:id/matches', profileController.getPlayerMatches);

  // Unmatched API routes return 404 JSON, never SPA fallback
  apiRouter.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `API endpoint ${req.method} ${req.originalUrl} not found`,
      },
    });
  });

  app.use('/api/v1', apiRouter);

  // 6. Static SPA Asset Serving (Production / Distribution)
  const clientDistPath = path.resolve(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(clientDistPath)) {
    // Immutable cache for fingerprinted Vite assets
    app.use(
      '/assets',
      express.static(path.join(clientDistPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );

    // Dynamic shell files with must-revalidate headers
    app.use(
      express.static(clientDistPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          }
        },
      })
    );

    // SPA client-side router fallback (EXCLUDING /api/*, /health, /ready)
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/ready') {
        return next();
      }
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  // 7. Global Error Handler
  app.use(errorHandler);

  return app;
}
