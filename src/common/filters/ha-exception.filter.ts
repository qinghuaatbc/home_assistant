import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Maps exceptions to Home Assistant REST API error format.
 * HA returns: { "message": "...", "code": "..." } on errors
 */
@Catch()
export class HaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HaExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'unknown_error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || message;
        code = (resp.error as string) || code;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled error: ${message}`, exception.stack);
    }

    // Map HTTP status to HA error codes
    switch (status) {
      case HttpStatus.NOT_FOUND:
        code = 'not_found';
        break;
      case HttpStatus.UNAUTHORIZED:
        code = 'unauthorized';
        break;
      case HttpStatus.FORBIDDEN:
        code = 'forbidden';
        break;
      case HttpStatus.BAD_REQUEST:
        code = 'invalid_format';
        break;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        code = 'invalid_format';
        break;
    }

    this.logger.debug(
      `${request.method} ${request.url} → ${status} ${code}: ${message}`,
    );

    response.status(status).json({ message, code });
  }
}
