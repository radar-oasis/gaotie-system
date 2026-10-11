import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, PublicUser } from './auth.service';

interface AuthBody {
  username: string;
  password: string;
  displayName?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() body: AuthBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: PublicUser }> {
    const result = await this.authService.register(body);
    this.setSessionCookie(response, result.sessionToken);

    return { user: result.user };
  }

  @Post('login')
  async login(
    @Body() body: AuthBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: PublicUser }> {
    const result = await this.authService.login(body);
    this.setSessionCookie(response, result.sessionToken);

    return { user: result.user };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    await this.authService.logout(this.getSessionToken(request));
    response.clearCookie(this.authService.getSessionCookieName(), {
      path: '/',
    });

    return { success: true };
  }

  @Get('me')
  async me(@Req() request: Request): Promise<{ user: PublicUser | null }> {
    const user = await this.authService.getUserBySessionToken(
      this.getSessionToken(request),
    );

    return { user };
  }

  private getSessionToken(request: Request): string | undefined {
    return this.authService.getSessionTokenFromCookieHeader(
      request.headers.cookie,
    );
  }

  private setSessionCookie(response: Response, sessionToken: string): void {
    response.cookie(this.authService.getSessionCookieName(), sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.SESSION_COOKIE_SECURE === 'true',
      maxAge: this.authService.getSessionMaxAgeMs(),
      path: '/',
    });
  }
}

export async function requireUserFromRequest(
  authService: AuthService,
  request: Request,
): Promise<PublicUser> {
  const user = await authService.getUserBySessionToken(
    authService.getSessionTokenFromCookieHeader(request.headers.cookie),
  );

  if (!user) {
    throw new UnauthorizedException('请先登录');
  }

  return user;
}
