var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var express = require('express');
var session = require('express-session');
var createError = require('http-errors');
var fs = require('fs');
var logger = require('morgan');
var passport = require('passport');
var path = require('path');

var app = express();

var config = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'config.json')))[process.env.NODE_ENV];

// Connect to ES on start
var elasticsearch = require('./elasticsearch');
elasticsearch.connect(config.elasticsearch, function(err) {
  if (err) {
    console.log('Unable to connect to ES.')
    process.exit(1)
  }
})

if (process.env.LAMBDA_TASK_ROOT) {
  app.set('trust proxy', true);
}

var sql = require('./sql');
sql.connect(config.postgres);

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));

try {
  var SequelizeStore = require('connect-session-sequelize')(session.Store);
  app.use(session({
    secret: config.session_secret,
    store: new SequelizeStore({ db: sql.get() }),
    resave: false,
    saveUninitialized: false,
  }));
} catch (e) { console.log(e); }
app.use(passport.initialize());
app.use(passport.session());

var awsServerlessExpressMiddleware = require('aws-serverless-express/middleware');
app.use(awsServerlessExpressMiddleware.eventContext());

app.use(function(req, res, next) {
  if (req.path.startsWith('/api/auth') || req.isAuthenticated()) {
    next();
  } else {
    res.status(401);
  }
});

// var indexRouter = require('./routes/index');
var casesRouter = require('./routes/cases');
var articlesRouter = require('./routes/articles');
var jobsRouter = require('./routes/jobs');
var authRouter = require('./routes/auth');

// app.use('/', indexRouter);
app.use('/api/cases', casesRouter);
app.use('/api/articles', articlesRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/auth', authRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.json({
    message: err.message,
    error: err,
    status: err.status || 500,
  });
});

module.exports = app;
