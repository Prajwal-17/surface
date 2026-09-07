export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 410 | 429 | 500 | 502 | 503,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
