/**
 * Global Express error-handling middleware.
 *
 * Catches all errors forwarded via next(err) and returns a
 * consistent JSON response to the client.
 */

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  // Log full error in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
  }

  const statusCode = err.statusCode || 500;
  const message =
    statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
  });
};

module.exports = errorHandler;
