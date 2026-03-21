/**
 * Wraps async route handlers to eliminate repetitive try/catch blocks.
 * Usage: router.get("/", asyncHandler(async (req, res) => { ... }))
 * Any thrown error is forwarded to the Express error handler middleware.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
