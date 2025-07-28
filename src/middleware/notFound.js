const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  error.isOperational = true;
  next(error);
};

module.exports = notFound;
