/**
 * Minimal OAuth 2.0 helper for the YouTube Data API v3.
 *
 * In `live` mode this uses googleapis. In `dry-run` / `sandbox` mode it builds
 * the auth URL and mocks the token exchange so the adapter is fully verifiable
 * without network access or real credentials.
 */
import type { YouTubeCredentials, YouTubeTokens } from './types.js';

const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';

export class YouTubeAuth {
    private creds: YouTubeCredentials;
    private client: any = null;
    private dryRun: boolean;

    constructor(creds: YouTubeCredentials, dryRun = true) {
        this.creds = creds;
        this.dryRun = dryRun;
    }

    private getClient(): any {
        if (this.client) return this.client;
        throw new Error('OAuth client requested before googleapis loaded. Use live mode with googleapis installed.');
    }

    /** Lazily construct the OAuth client using the (dynamically imported) SDK. */
    private async loadClient(): Promise<any> {
        if (this.client) return this.client;
        const { google } = await import('googleapis');
        this.client = new google.auth.OAuth2({
            clientId: this.creds.clientId,
            clientSecret: this.creds.clientSecret,
            redirectUri: this.creds.redirectUri,
        });
        return this.client;
    }

    /** Build the consent URL the user visits to authorize the app. */
    async buildAuthUrl(state = 'av-generator'): Promise<string> {
        if (this.dryRun) {
            const params = new URLSearchParams({
                client_id: this.creds.clientId || 'DRYRUN_CLIENT_ID',
                redirect_uri: this.creds.redirectUri,
                response_type: 'code',
                scope: YOUTUBE_SCOPES.join(' '),
                access_type: 'offline',
                prompt: 'consent',
                state,
            });
            return `${AUTH_BASE}?${params.toString()}`;
        }

        const client = await this.loadClient();
        return client.generateAuthUrl({
            access_type: 'offline',
            scope: YOUTUBE_SCOPES,
            prompt: 'consent',
            state,
        });
    }

    /** Exchange the authorization code for tokens. */
    async exchangeCode(code: string): Promise<YouTubeTokens> {
        if (this.dryRun) {
            return {
                accessToken: `dryrun_access_${Date.now()}`,
                refreshToken: `dryrun_refresh_${Date.now()}`,
                scope: YOUTUBE_SCOPES.join(' '),
                tokenType: 'Bearer',
                expiryDate: Date.now() + 3600_000,
            };
        }

        const client = await this.getClient();
        const { tokens } = await client.getToken(code);
        return {
            accessToken: tokens.access_token ?? '',
            refreshToken: tokens.refresh_token ?? undefined,
            scope: tokens.scope ?? YOUTUBE_SCOPES.join(' '),
            tokenType: tokens.token_type ?? 'Bearer',
            expiryDate: tokens.expiry_date,
        };
    }

    /** Refresh an expired access token using the stored refresh token. */
    async refresh(refreshToken: string): Promise<YouTubeTokens> {
        if (this.dryRun) {
            return {
                accessToken: `dryrun_access_refreshed_${Date.now()}`,
                refreshToken,
                scope: YOUTUBE_SCOPES.join(' '),
                tokenType: 'Bearer',
                expiryDate: Date.now() + 3600_000,
            };
        }

        const client = await this.getClient();
        client.setCredentials({ refresh_token: refreshToken });
        const { credentials } = await client.refreshAccessToken();
        return {
            accessToken: credentials.access_token ?? '',
            refreshToken: credentials.refresh_token ?? refreshToken,
            scope: credentials.scope ?? YOUTUBE_SCOPES.join(' '),
            tokenType: credentials.token_type ?? 'Bearer',
            expiryDate: credentials.expiry_date,
        };
    }

    static get scopes(): string[] {
        return YOUTUBE_SCOPES;
    }
}
