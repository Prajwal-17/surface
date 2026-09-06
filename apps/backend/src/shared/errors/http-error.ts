export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 500 | 502,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "The requested resource was not found.") {
    super(404, message);
    this.name = "NotFoundError";
  }
}
