import {
  ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProd = process.env.NODE_ENV === 'production';

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    // In production, never expose internal error details or stack traces
    const message = isProd
      ? status < 500
        ? (typeof exceptionResponse === 'string'
            ? exceptionResponse
            : (exceptionResponse as any)?.message ?? HttpStatus[status])
        : 'An unexpected error occurred'
      : exception instanceof Error
        ? exception.message
        : String(exception);

    this.logger.error(
      JSON.stringify({
        service: 'exception-filter',
        operation: 'unhandled_exception',
        statusCode: status,
        path: request.url,
        method: request.method,
        // Never log the full error in production to avoid sensitive data leakage in log aggregators
        message: isProd ? `HTTP ${status}` : (exception instanceof Error ? exception.message : String(exception)),
        stack: isProd ? undefined : (exception instanceof Error ? exception.stack : undefined),
      }),
    );

    response.status(status).json({
      statusCode: status,
      message,
      error: HttpStatus[status],
    });
  }
}
