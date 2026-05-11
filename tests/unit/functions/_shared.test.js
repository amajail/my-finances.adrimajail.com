/**
 * Unit tests for shared response helpers
 * Tests error mapping from domain errors to HTTP responses
 */

const { mapError, ok, created, noContent, fail, corsHeaders } = require('../../../src/functions/_shared');
const {
  AppError,
  ValidationError,
  NotFoundError,
  DomainError,
  InfrastructureError,
} = require('../../../src/shared/errors');

describe('_shared.js response helpers', () => {
  describe('corsHeaders', () => {
    it('should not emit CORS headers (handled by Azure platform CORS)', () => {
      const headers = corsHeaders();
      expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
      expect(headers['Access-Control-Allow-Methods']).toBeUndefined();
      expect(headers['Access-Control-Allow-Headers']).toBeUndefined();
    });

    it('should merge extra headers', () => {
      const extra = { 'Cache-Control': 'max-age=30' };
      const headers = corsHeaders(extra);
      expect(headers['Cache-Control']).toBe('max-age=30');
    });
  });

  describe('ok', () => {
    it('should return 200 with jsonBody', () => {
      const response = ok({ data: 'test' });
      expect(response.status).toBe(200);
      expect(response.jsonBody).toEqual({ data: 'test' });
    });

    it('should include extra headers', () => {
      const response = ok({ data: 'test' }, { 'Cache-Control': 'max-age=60' });
      expect(response.headers['Cache-Control']).toBe('max-age=60');
    });
  });

  describe('created', () => {
    it('should return 201 with jsonBody', () => {
      const response = created({ id: '123' });
      expect(response.status).toBe(201);
      expect(response.jsonBody).toEqual({ id: '123' });
    });
  });

  describe('noContent', () => {
    it('should return 204 with no body', () => {
      const response = noContent();
      expect(response.status).toBe(204);
    });
  });

  describe('fail', () => {
    it('should return error response with status and message', () => {
      const response = fail(400, 'Bad request');
      expect(response.status).toBe(400);
      expect(response.jsonBody.error).toBe('Bad request');
    });

    it('should include extra fields like details', () => {
      const response = fail(400, 'Validation failed', { details: ['field1 required'] });
      expect(response.jsonBody.details).toEqual(['field1 required']);
    });
  });

  describe('mapError', () => {
    const mockContext = { log: { error: jest.fn() } };

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should map ValidationError to 400', () => {
      const err = new ValidationError('Validation failed');
      err.details = ['field1 required'];
      const response = mapError(err, mockContext);
      expect(response.status).toBe(400);
      expect(response.jsonBody.error).toBe('Validation failed');
      expect(response.jsonBody.details).toEqual(['field1 required']);
    });

    it('should map NotFoundError to 404', () => {
      const err = new NotFoundError('Resource', 'not-found-id');
      const response = mapError(err, mockContext);
      expect(response.status).toBe(404);
      expect(response.jsonBody.error).toBe('Resource not found: not-found-id');
    });

    it('should map DomainError to 422', () => {
      const err = new DomainError('Invalid business rule');
      const response = mapError(err, mockContext);
      expect(response.status).toBe(422);
      expect(response.jsonBody.error).toBe('Invalid business rule');
    });

    it('should map InfrastructureError to 502', () => {
      const err = new InfrastructureError('Database connection failed');
      const response = mapError(err, mockContext);
      expect(response.status).toBe(502);
      expect(response.jsonBody.error).toBe('Database connection failed');
    });

    it('should map AppError to statusCode or 500', () => {
      const err = new AppError('Generic app error', 503);
      const response = mapError(err, mockContext);
      expect(response.status).toBe(503);
      expect(response.jsonBody.error).toBe('Generic app error');
    });

    it('should map unknown errors to 500', () => {
      const err = new Error('Unknown error');
      const response = mapError(err, mockContext);
      expect(response.status).toBe(500);
      expect(response.jsonBody.error).toBe('Unknown error');
    });

    it('should handle errors without message', () => {
      const err = {};
      const response = mapError(err, mockContext);
      expect(response.status).toBe(500);
      expect(response.jsonBody.error).toBe('Internal server error');
    });

    it('should log error via context', () => {
      const err = new Error('Test error');
      mapError(err, mockContext);
      expect(mockContext.log.error).toHaveBeenCalled();
    });

    it('should handle missing context gracefully', () => {
      const err = new NotFoundError('Not found');
      const response = mapError(err);
      expect(response.status).toBe(404);
    });
  });
});
