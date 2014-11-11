'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
    passport = require('passport'),
    nodemailer = require('nodemailer'),
    crypto = require('crypto'),
    User = mongoose.model('User'),
    _ = require('lodash'),
    util = require('util'),
    mailouts = require('../../config/mailouts'),
    debug = require('debug')('users');

var copySchoolDetails = function(s, user) {
        if (s) {
            user.schoolurn = s.urn || '';
            user.schoolname = s.name || '';
            user.schooladdr1 = s.addr1 || '';
            user.schooladdr2 = s.addr2 || '';
            user.schooladdr3 = s.addr3 || '';
            user.schooltown = s.town || '';
            user.schoolpostCode = s.postCode || '';
        }
        else {
            user.schoolurn = 
            user.schoolname =
            user.schooladdr1 =
            user.schooladdr2 =
            user.schooladdr3 =
            user.schooltown =
            user.schoolpostCode = '';
        }
    };

var copyParams = function(query, user) {
        var keys = ['username', 'affiliated', 'email', 'firstName', 'lastName', 'title'];
        keys.forEach(function(key) {
            if(query[key] !== undefined) {
                user[key] = query[key];
            }
        });

        var s = null;
        if(query.school) {
            try {
                s = JSON.parse(query.school);
                if(s) copySchoolDetails(s, user);
            } catch (e) {
                debug('invalid school data', util.inspect(query.school));
            }
        }
        user.email2 = '';

    };

/**
 * Get the error message from error object
 */
var getErrorMessage = function(err) {
    var message = '';

    if (err.code) {
        switch (err.code) {
            case 11000:
            case 11001:
                message = 'Username or Email already exists';
                break;
            default:
                message = 'database error, code=' + err.code;
        }
    } else {
        for (var errName in err.errors) {
            if (err.errors[errName].message) message = err.errors[errName].message;
        }
    }

    return message;
};

/**
 * Signup
 */
exports.signup = function(req, res) {
    // For security measure we remove the roles from the req.body object

    delete req.body.roles;

    // Init Variables
    var user = new User(req.body);
    var message = null;
    var s = req.body.school;

    // Add missing user fields
    user.provider = 'local';
    user.displayName = user.firstName + ' ' + user.lastName;

    //debug('school = ' + util.inspect(s));
    if (s) copySchoolDetails(s, user);

    // Then save the user 
    user.save(function(err) {
        if (err) {
            debug(getErrorMessage(err));
            return res.send(400, getErrorMessage(err));
        } else {

            // Remove sensitive data before login
            user.password = undefined;
            user.salt = undefined;

            req.login(user, function(err) {
                if (err) {
                    debug(err);
                    res.send(400, err);
                } else {
                    res.jsonp(user);
                }
            });
        }
    });
};

/**
 * Signin after passport authentication
 */
exports.signin = function(req, res, next) {
    //debug('signin request');
    // First check whether this is a one-time sign-in
    //debug('req.body = ' + util.inspect(req.body));

    if (req.body) {
        var email = req.body.email;
        var password = req.body.password;
        var oneTime = req.body.oneTime;

        // fetch user details
        if (oneTime) {
            return User.findOne({
                email: email
            }).exec(function(err, user) {


                if (err) {
                    debug(err);
                    res.send(400, {
                        message: 'Lookup failure on ' + email
                    });
                } else {


                    //
                    // If this is a one-time-login we should have an in-date resetPasswordToken
                    //
                    if (user &&
                        user.resetPasswordToken &&
                        user.resetPasswordExpires.getTime() > Date.now()) {

                        // The one-time request has happened! Need to forget about it.
                        if (user.resetPasswordToken === password) {

                            // Cancel the token
                            user.resetPasswordToken = '';
                            user.resetPasswordExpires = new Date().setTime(0);

                            // and save the cancelled token 
                            return user.save(function(err) {
                                if (err) {
                                    res.send(400, {
                                        message: getErrorMessage(err)
                                    });
                                } else {
                                    // We need to set the session cookie so user
                                    // can be redirected to settings page.

                                    // Remove sensitive data before login
                                    user.password = undefined;
                                    user.salt = undefined;

                                    req.login(user, function(err) {
                                        if (err) {
                                            // debug('signin 400 failure');
                                            // debug(util.inspect(err));
                                            res.send(400, err);
                                        } else {
                                            res.jsonp(200, {
                                                user: user
                                            });
                                        }
                                    });
                                }
                            });
                        }
                    }
                }
            });
        }
        // otherwise drop through to normal authenticate
    }

    passport.authenticate('local', function(err, user, info) {
        if (err) {
            debug('signin err = ' + err);
            res.send(400, err);
        } else if (!user) {
            debug('no user ' + info.message);
            res.send(400, info);
        } else {
            // Remove sensitive data before login
            user.password = undefined;
            user.salt = undefined;

            req.login(user, function(err) {
                if (err) {
                    // debug('signin 400 failure');
                    // debug(util.inspect(err));
                    res.send(400, err);
                } else {
                    res.jsonp(user);
                }
            });
        }
    })(req, res, next);
};

/**
 * Find user by email or username
 */
exports.findOne = function(req, res) {

    var email = req.query.email;
    var username = req.query.username;

    if (email) {
        User.findOne({
            email: email
        }).exec(function(err, user) {
            if (err) {
                debug(err);
                res.send(400, {
                    message: 'Lookup failure on ' + email
                });
            } else res.json({
                user: user
            });
        });
    } else if (username) {
        User.findOne({
            username: username
        }).exec(function(err, user) {
            if (err) {
                debug(err);
                res.send(400, {
                    message: 'Lookup failure on ' + username
                });
            } else res.json({
                user: user
            });
        });
    } else {
        res.send(400, {
            message: 'empty query'
        });
    }

};

/**
 * Update user details
 */
exports.update = function(req, res) {

    debug('HELLO');

    var email = req.query.email;
    var username = req.query.username;
    var updateUser = function(req, res, user) {

        // Init Variables
        var message = null;

        // For security measurement we remove the roles from the req.body object
        delete req.body.roles;

        if (user) { 
            // Merge editable fields of existing user
            copyParams(req.query, user);

            debug('query = ' + util.inspect(req.query));

            //debug('extending user with req.body');
            //debug(util.inspect(req.body));

            user.updated = Date.now();
            user.displayName = user.firstName + ' ' + user.lastName;
            // user.username = user.email;

            debug('user = ' + util.inspect(user));

            user.save(function(err) {
                if (err) {
                    debug('e400 1');
                    return res.send(400, {
                        message: getErrorMessage(err)
                    });
                } else {
                    req.login(user, function(err) {
                        debug ('login');
                        if (err) {
                            debug('e400 2');
                            res.send(400, err);
                        } else {
                            debug('jsonp');
                            res.jsonp(user);
                        }
                    });
                }
            });
        } else {
            res.send(400, {
                message: 'User is not signed in'
            });
        }
    };

    var tryUsername = function(username) {
        if (username) {
            User.findOne({
                username: username
            }).exec(function(err, user) {
                if (err) {
                    debug('username lookup failed = '+username);
                    debug(err);
                    res.send(400, {
                        message: 'Failed to find user'
                    });
                } 
                else 
                    if(user) {
                        updateUser(req, res, user);
                    }
                    else {
                        res.send(400, {
                            message: 'Failed to find user'
                        });
                    }
            });
        } else {
            debug('no username');
            res.send(400, {
                message: 'empty query'
            });
        }
    };

    if (email) {
        debug('email = '+email);
        User.findOne({
            email: email
        }).exec(function(err, user) {
            if (err) {
                tryUsername(username);
            } 
            else {
                if(user === null) {
                    tryUsername(username);
                }
                else {
                    updateUser(req, res, user);
                }
            }
        });
    } else {
        tryUsername(username);
    }

};

// This is an example that works on the server:

// var smtpTransport = nodemailer.createTransport('SMTP', {
//     host: 'smtp.hermes.cam.ac.uk',
//     port: 587,
//     debug: true,
//     auth: {
//         user: process.env.crsid,
//         pass: process.env.hermesPassword
//     }
// });

// /**
//  * return response email to a password reset request
//  */
// function resetMail(toEmail, oneTimePassword) {
//     return {
//         from: '<gmp26@cam.ac.uk>',
//         to: toEmail,
//         subject: 'CMEP Password Reset Request',
//         html: '<p>We received a password reset request for your CMEP account.</p>' +
//             '<p>A new password has been generated for you which is good ' +
//             'for one sign-in only within the next hour. ' +
//             'Your one-time password is</p>' +
//             '<div style="font-weight:bold;font-size:1.8em">' + oneTimePassword + '</div>' +
//             '<p>Please sign in with this password. ' +
//             'You will then be redirected to a page where you can choose a new password</p>' +
//             '<p>If this password has already expired, you will be given an opportunity to request another.</p>'
//     };
// }

function makeOneTimePassword() {
    return crypto.randomBytes(12).toString('base64');
}

/**
 * Reset Password
 */
exports.resetPassword = function(req, res) {
    debug('body email = ' + req.body.resetEmail);
    var resetEmail = req.body.resetEmail;
    if (resetEmail) {
        User.findOne({
            email: resetEmail
        }).exec(function(err, user) {
            if (err) {
                debug(err);
                return res.send(400, {
                    message: 'Lookup failure on ' + resetEmail
                });
            } else {

                // generate one-time password
                // var oneTime = makeOneTimePassword();

                // TODO: guard agains possibly null user!
                if (!user) {
                    return res.json(400, {
                        message: 'email not recognised'
                    });
                }
                
                user.resetPasswordToken = makeOneTimePassword();

                // start timeout on password
                // var timeout = setTimeout(clearOneTime, 1000 * 3600, resetEmail);

                // store one-time password along with timeoutObject
                // oneTimes[resetEmail] = [oneTime, timeout];

                // Then save the one-time-password
                user.resetPasswordExpires = new Date(Date.now() + 1000 * 3600);

                user.save(function(err) {
                    if (err) {
                        return res.send(400, getErrorMessage(err));
                    } else {
                        // Remove sensitive data (?)
                        user.password = undefined;
                        user.salt = undefined;

                        // email user with password
                        // send mail with defined transport object
                        mailouts.sendMail(
                            mailouts.sendOneTimePassword(user.email, user.resetPasswordToken),
                            function(err, response) {
                                if (err) {
                                    console.log(err);
                                    res.send(400, {
                                        message: 'unable to send email '
                                    });
                                } else {
                                    console.log('Message sent: ' + response.message);
                                    // simple success displays instructions to user
                                    return res.json(200, {
                                        message: 'email sent '
                                    });
                                }
                                // if you don't want to use this transport object anymore, uncomment following line
                                //smtpTransport.close(); // shut down the connection pool, no more messages
                            }
                        );

                    }
                });
            }
        });
    } else {
        return res.json(400, {
            message: 'no email in request'
        });
    }
};

/**
 * Change OneTime Password. This is only called once the user is logged in
 */
exports.changeOneTimePassword = function(req, res, next) {
    // Init Variables
    var passwordDetails = req.body;
    var message = null;

    if (req.user) {
        User.findById(req.user.id, function(err, user) {
            if (!err && user) {
                if (passwordDetails.newPassword === passwordDetails.verifyPassword) {
                    user.password = passwordDetails.newPassword;

                    user.save(function(err) {
                        if (err) {
                            return res.send(400, {
                                message: getErrorMessage(err)
                            });
                        } else {
                            req.login(user, function(err) {
                                if (err) {
                                    res.send(400, err);
                                } else {
                                    res.send({
                                        message: 'Password changed successfully'
                                    });
                                }
                            });
                        }
                    });
                } else {
                    res.send(400, {
                        message: 'Passwords do not match'
                    });
                }
            } else {
                res.send(400, {
                    message: 'User is not found'
                });
            }
        });
    } else {
        res.send(400, {
            message: 'User is not signed in'
        });
    }
};

/**
 * Change Password
 */
exports.changePassword = function(req, res, next) {
    // Init Variables
    var passwordDetails = req.body;
    var message = null;

    if (req.user) {
        User.findById(req.user.id, function(err, user) {
            if (!err && user) {
                if (user.authenticate(passwordDetails.currentPassword)) {
                    if (passwordDetails.newPassword === passwordDetails.verifyPassword) {
                        user.password = passwordDetails.newPassword;

                        user.save(function(err) {
                            if (err) {
                                return res.send(400, {
                                    message: getErrorMessage(err)
                                });
                            } else {
                                req.login(user, function(err) {
                                    if (err) {
                                        res.send(400, err);
                                    } else {
                                        res.send({
                                            message: 'Password changed successfully'
                                        });
                                    }
                                });
                            }
                        });
                    } else {
                        res.send(400, {
                            message: 'Passwords do not match'
                        });
                    }
                } else {
                    res.send(400, {
                        message: 'Current password is incorrect'
                    });
                }
            } else {
                res.send(400, {
                    message: 'User is not found'
                });
            }
        });
    } else {
        res.send(400, {
            message: 'User is not signed in'
        });
    }
};

/**
 * Signout
 */
exports.signout = function(req, res) {
    console.log('signout called');
    req.logout();
    // force page reload so user data will update
    res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    res.redirect('back');
};

/**
 * Send User
 */
exports.me = function(req, res) {
    res.jsonp(req.user || null);
};

/**
 * OAuth callback
 */
exports.oauthCallback = function(strategy) {
    return function(req, res, next) {
        passport.authenticate(strategy, function(err, user, redirectURL) {
            if (err || !user) {
                return res.redirect('/mean/#!/signin');
            }
            req.login(user, function(err) {
                if (err) {
                    return res.redirect('/mean/#!/signin');
                }

                return res.redirect(redirectURL || '/mean/');
            });
        })(req, res, next);
    };
};

/**
 * User middleware: find user by ID, annotating request with list
 * of admins and moderators
 */
exports.userByID = function(req, res, next, id) {
    User.findOne({
        _id: id
    }).exec(function(err, user) {
        if (err) return next(err);
        if (!user) return next(new Error('Failed to load User ' + id));
        req.profile = user;
        next();
    });
};

/**
 * Query builders returning queries for subsets of users

exports.getAdminsQuery = function() {
    User.find({
        roles: {$in: ['admin']}
    })
};

exports.getModeratorsQuery = function() {
    User.find({
        roles: {$in: ['moderator']}
    })
};

exports.getAdminsOnlyQuery = function() {
    Users.find({
        $and: [ 
            {roles: {$in: ['admin']}}, 
            {roles: {$nin: ['moderator']}}
        ]})
};

exports.getModeratorsOnlyQuery = function() {
    Users.find({
        $and: [ 
            {roles: {$in: ['moderator']}}, 
            {roles: {$nin: ['admin']}} 
        ]})
};

exports.getAdminsOrModeratorsQuery = function() {
    Users.find({
        roles: {$in: ['admin', 'moderator']}
    })
};

exports.getAdminsAndModeratorsQuery = function() {
    Users.find({
        roles: {$in: ['admin', 'moderator']}
    })
};
*/

/**
 * Require login routing middleware
 */
exports.requiresLogin = function(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.send(401, {
            message: 'User is not logged in'
        });
    }

    next();
};

/**
 * User authorizations routing middleware
 */
exports.hasAuthorization = function(roles) {
    var _this = this;

    return function(req, res, next) {
        _this.requiresLogin(req, res, function() {
            if (_.intersection(req.user.roles, roles).length) {
                return next();
            } else {
                return res.send(403, {
                    message: 'User is not authorized'
                });
            }
        });
    };
};

