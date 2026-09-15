export function errorHandler(error, _req, res, next) {
  if (res.headersSent) return next(error);
  let status = error.statusCode || (error.name === 'ValidationError' ? 422 : error.name === 'CastError' ? 422 : error instanceof SyntaxError ? 400 : 500);
  let message = error.message;
  if (error.code === 11000) {
    status = 409;
    message = 'A record with that value already exists.';
  }
  if (status >= 500) console.error(error);
  if (!message || (status >= 500 && process.env.NODE_ENV === 'production')) {
    message = status >= 500 ? 'Internal server error' : 'Request failed';
  }
  res.status(status).json({ success: false, message, errors: error.errors || [] });
}

export function notFoundHandler(req, _res, next) {
  next(Object.assign(new Error(`Route not found: ${req.method} ${req.originalUrl}`), { statusCode: 404 }));
}
