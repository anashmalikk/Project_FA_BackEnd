export const authenticate = (req, res, next) => {
  if (req.headers.authorization) {
    const token = req.headers.authorization.split(" ")[1];
    req.token = token;
    next();
  } else {
    res.status(401).send({
      message: "Please login to access this route",
    });
  }
};