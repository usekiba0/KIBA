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

    this.logger.error(
      JSON.stringify({
        service: 'exception-filter',
        operation: 'unhandled_exception',
        statusCode: status,
        path: request.url,
        method: request.method,
        message: isProd ? `HTTP ${status}` : (exception instanceof Error ? exception.message : String(exception)),
        stack: isProd ? undefined : (exception instanceof Error ? exception.stack : undefined),
      }),
    );

    if (!isProd && exceptionResponse) {
      // Pass through full HttpException body (includes ValidationPipe field errors)
      response.status(status).json(exceptionResponse);
      return;
    }

    const message = isProd
      ? status < 500
        ? (typeof exceptionResponse === 'string'
            ? exceptionResponse
            : (exceptionResponse as any)?.message ?? HttpStatus[status])
        : 'An unexpected error occurred'
      : exception instanceof Error
        ? exception.message
        : String(exception);

    response.status(status).json({
      statusCode: status,
      message,
      error: HttpStatus[status],
    });
  }
}
