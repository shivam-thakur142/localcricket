// ====================================================================
// SCORER CONTROLLER: HTTP HANDLERS
// ====================================================================

import { ApiResponse } from '../utils/ApiResponse.js';

export class ScorerController {
  constructor(scoringService) {
    this.scoringService = scoringService;
  }

  recordToss = async (req, res, next) => {
    try {
      const match = await this.scoringService.recordToss(req.params.matchId, req.body);
      ApiResponse.success(match, 'Toss recorded successfully').send(res);
    } catch (err) {
      next(err);
    }
  };

  submitSquad = async (req, res, next) => {
    try {
      const result = await this.scoringService.submitSquad(req.params.matchId, req.body);
      ApiResponse.success(result, 'Squad confirmed successfully').send(res);
    } catch (err) {
      next(err);
    }
  };

  startInnings = async (req, res, next) => {
    try {
      const result = await this.scoringService.startInnings(req.params.matchId, req.body);
      ApiResponse.created(result, 'Innings started successfully').send(res);
    } catch (err) {
      next(err);
    }
  };

  startOver = async (req, res, next) => {
    try {
      const result = await this.scoringService.startOver(req.params.matchId, req.body);
      ApiResponse.created(result, 'New over started successfully').send(res);
    } catch (err) {
      next(err);
    }
  };

  recordDelivery = async (req, res, next) => {
    try {
      const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotency_key || null;
      const result = await this.scoringService.recordDelivery(
        req.params.matchId,
        req.body,
        req.user.id,
        idempotencyKey
      );
      ApiResponse.success(result, 'Delivery recorded successfully').send(res);
    } catch (err) {
      next(err);
    }
  };

  undoDelivery = async (req, res, next) => {
    try {
      const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotency_key || null;
      const expectedSequence = req.body.expected_delivery_sequence || req.body.expected_sequence || null;
      const reason = req.body.reversion_reason || 'Scorer requested undo';
      const isOffline = req.body.is_offline || req.headers['x-offline-replay'] === 'true' || Boolean(req.body.target_delivery_id);
      const result = await this.scoringService.undoDelivery(req.params.matchId, req.user.id, {
        reversionReason: reason,
        expectedDeliverySequence: expectedSequence ? Number(expectedSequence) : null,
        targetDeliveryId: req.body.target_delivery_id || null,
        isOffline,
        idempotencyKey,
      });
      ApiResponse.success(result, 'Delivery reverted successfully').send(res);
    } catch (err) {
      next(err);
    }
  };
}
