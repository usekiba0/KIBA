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

    // Always log the real error message and stack — even in production
    this.logger.error(
      JSON.stringify({
        service: 'exception-filter',
        operation: 'unhandled_exception',
        statusCode: status,
        path: request.url,
        method: request.method,
        message: exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack?.split('\n').slice(0, 6).join(' | ') : undefined,
      }),
    );

    // In dev: pass through full HttpException body (includes ValidationPipe field errors)
    if (!isProd && exceptionResponse) {
      response.status(status).json(exceptionResponse);
      return;
    }

    // Derive a client-safe message
    let message: string;
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      message = typeof body === 'string'
        ? body
        : (body as any)?.message ?? HttpStatus[status];
      if (Array.isArray(message)) message = (message as string[]).join(' · ');
    } else if (isStripeError(exception)) {
      // Surface Stripe errors as 502 with a useful message
      response.status(502).json({
        statusCode: 502,
        message: `Payment provider error: ${(exception as any).message}`,
        error: 'Bad Gateway',
      });
      return;
    } else {
      message = 'An unexpected error occurred';
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: HttpStatus[status],
    });
  }
}

function isStripeError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.constructor.name.startsWith('Stripe') || (e as any).type?.startsWith('Stripe'))
  );
}
