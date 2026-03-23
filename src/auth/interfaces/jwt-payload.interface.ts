export interface JwtPayload {
  /** User ID */
  sub: string;
  /** Issuer */
  iss: 'homeassistant';
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Expiry (Unix timestamp) */
  exp: number;
  /** Token type */
  token_type: 'normal' | 'long_lived_access_token';
  /** OAuth client ID (optional) */
  client_id?: string;
}
