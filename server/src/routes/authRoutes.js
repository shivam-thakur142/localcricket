// ====================================================================
// AUTHENTICATION & INVITATION ROUTES
// ====================================================================

import { Router } from 'express';
import { ApiResponse } from '../utils/ApiResponse.js';
import {
  registerUser,
  loginUser,
  rotateRefreshToken,
  logoutSession,
  logoutAllSessions,
  changePassword,
  getUserProfile,
  updateUserProfile,
} from '../services/authService.js';
import {
  createInvitation,
  listTournamentInvitations,
  revokeInvitation,
  previewInvitation,
  acceptInvitation,
} from '../services/invitationService.js';

const REFRESH_COOKIE_NAME = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export function createAuthRoutes(db, authMiddleware) {
  const router = Router();

  // 1. Register User
  router.post('/register', async (req, res, next) => {
    try {
      const { fullName, email, password, phone } = req.body || {};
      const result = await registerUser(db, {
        fullName,
        email,
        password,
        phone,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);
      ApiResponse.created(
        { user: result.user, accessToken: result.accessToken },
        'User registered successfully'
      ).send(res);
    } catch (err) {
      next(err);
    }
  });

  // 2. Login User
  router.post('/login', async (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      const result = await loginUser(db, {
        email,
        password,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);
      ApiResponse.success(
        { user: result.user, accessToken: result.accessToken },
        'Login successful'
      ).send(res);
    } catch (err) {
      next(err);
    }
  });

  // 3. Concurrency-Safe Refresh Token Rotation
  router.post('/refresh', async (req, res, next) => {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
      const result = await rotateRefreshToken(db, rawRefreshToken, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);
      ApiResponse.success(
        { user: result.user, accessToken: result.accessToken },
        'Token refreshed successfully'
      ).send(res);
    } catch (err) {
      next(err);
    }
  });

  // 4. Logout Session
  router.post('/logout', async (req, res, next) => {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
      await logoutSession(db, rawRefreshToken);

      res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth',
      });

      ApiResponse.success({ success: true }, 'Logged out successfully').send(res);
    } catch (err) {
      next(err);
    }
  });

  // 5. Logout All Devices
  router.post('/logout-all', authMiddleware, async (req, res, next) => {
    try {
      await logoutAllSessions(db, req.user.id);

      res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth',
      });

      ApiResponse.success({ success: true }, 'Logged out from all devices successfully').send(res);
    } catch (err) {
      next(err);
    }
  });

  // 6. Current User Profile
  router.get('/me', authMiddleware, async (req, res, next) => {
    try {
      const profile = await getUserProfile(db, req.user.id);
      ApiResponse.success(profile).send(res);
    } catch (err) {
      next(err);
    }
  });

  // 7. Update User Profile
  router.put('/profile', authMiddleware, async (req, res, next) => {
    try {
      const { fullName, phone, avatarUrl } = req.body || {};
      const updated = await updateUserProfile(db, req.user.id, { fullName, phone, avatarUrl });
      ApiResponse.success(updated, 'Profile updated successfully').send(res);
    } catch (err) {
      next(err);
    }
  });

  // 8. Change Password & Invalidate All Sessions
  router.put('/password', authMiddleware, async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      const result = await changePassword(db, req.user.id, { currentPassword, newPassword });

      res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth',
      });

      ApiResponse.success(result, result.message).send(res);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * Public & Authenticated Invitation Routes mounted at /api/v1/invitations
 */
export function createPublicInvitationRoutes(db, authMiddleware) {
  const router = Router();

  // Public Preview of Invitation
  router.get('/:token', async (req, res, next) => {
    try {
      const preview = await previewInvitation(db, req.params.token);
      ApiResponse.success(preview).send(res);
    } catch (err) {
      next(err);
    }
  });

  // Authenticated Acceptance of Invitation
  router.post('/:token/accept', authMiddleware, async (req, res, next) => {
    try {
      const result = await acceptInvitation(db, req.params.token, req.user);
      ApiResponse.success(result, result.message).send(res);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
