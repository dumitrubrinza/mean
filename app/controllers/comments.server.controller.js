'use strict';
/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
    Comment = mongoose.model('Comment'),
    _ = require('lodash');

var debug = require('debug')('comments');
var util = require('util');

debug('server controller');

/**
 * Get the error message from error object
 */
var getErrorMessage = function(err) {
    var message = '';

    if (err.code) {
        switch (err.code) {
            case 11000:
            case 11001:
                message = 'Comment already exists';
                break;
            default:
                message = 'Something went wrong';
        }
    } else {
        for (var errName in err.errors) {
            if (err.errors[errName].message) message = err.errors[errName].message;
        }
    }

    return message;
};

/**
 * Create a comment
 */
exports.create = function(req, res) {

    var comment = new Comment();

    comment.spotId = req.body.spotId;
    comment.user = req.user._id;
    comment.title = req.body.title;
    comment.content = req.body.content;

    comment.save(function(err) {
        if (err) {
            return res.send(400, {
                message: getErrorMessage(err)
            });
        } else {
            res.jsonp(comment);
        }
    });
};

/**
 * Show the current comment
 */
exports.read = function(req, res) {
    res.jsonp(req.comment);
};

/**
 * Update a comment
 */
exports.update = function(req, res) {
    var comment = req.comment;

    comment.content = req.query.content;
    comment.title = req.query.title;

    // debug('comment:');
    // debug(util.inspect(comment));

    comment.save(function(err) {
        if (err) {
            return res.send(400, {
                message: getErrorMessage(err)
            });
        } else {
            res.jsonp(comment);
        }
    });
};

/**
 * Append a reply to a comment
 */
exports.appendReply = function(req, res) {
    var comment = req.comment;

    if (!comment.replies) {
        comment.replies = [];
    }
    comment.replies.push(req.query.reply);

    // debug('appendReply: ' + req.query.reply);
    // debug(util.inspect(comment));

    comment.save(function(err) {
        if (err) {
            return res.send(400, {
                message: getErrorMessage(err)
            });
        } else {
            res.jsonp(comment);
        }
    });
};

/**
 * Delete a comment
 */
exports.delete = function(req, res) {
    var comment = req.comment;

    comment.remove(function(err) {
        if (err) {
            return res.send(400, {
                message: getErrorMessage(err)
            });
        } else {
            res.jsonp(comment);
        }
    });
};



/**
 * Delete a comment reply
 */
exports.deleteReply = function(req, res) {
    var comment = req.comment;
    var replyIndex = req.replyIndex;

    comment.replies.splice(replyIndex, 1);

    debug('deleting reply at index :' + replyIndex);
    // debug(util.inspect(comment));

    comment.save(function(err) {
        if (err) {
            return res.send(400, {
                message: getErrorMessage(err)
            });
        } else {
            res.jsonp(comment);
        }
    });
};

/**
 * List of Comments
 */
exports.list = function(req, res) {
    var spotId = req.spotId;
    // debug('spotId = ' + spotId);
    Comment.find({
        spotId: spotId
    }).sort('-created')
        .populate('user', 'email displayName')
        .exec(function(err, comments) {
            if (err) {
                return res.send(400, {
                    message: getErrorMessage(err)
                });
            } else {
                debug('comments.list ok');
                res.jsonp(comments);
            }
        });
};

/**
 * Comment middleware
 */
exports.commentByID = function(req, res, next, id) {
    debug('findById comment ' + id);
    Comment.findById(id).populate('user', 'email displayName').exec(function(err, comment) {
        if (err) return next(err);
        if (!comment) return next(new Error('Failed to load comment ' + id));
        req.comment = comment;
        next();
    });
};

/**
 * Comment middleware
 */
exports.replyId = function(req, res, next, id) {
    var ids = id.split(':');
    var commentId = ids[0];
    var replyIndex = ids[1];
    debug('findById comment ' + commentId + ' replyIndex = ' + replyIndex);
    Comment.findById(id).populate('user', 'email displayName').exec(function(err, comment) {
        if (err) return next(err);
        if (!comment) return next(new Error('Failed to load comment ' + id));
        req.comment = comment;
        if (replyIndex < 0 || replyIndex >= comment.replies.length)
             return next(new Error('Reply Index out of range on comment ' + id + ' reply ' + replyIndex));
        req.replyIndex = replyIndex;
        next();
    });
};

/**
 * Upvote a comment
 */
exports.upvote = function(req, res) {
    debug('req.id = ' + req.body.commentId);
    if (req.body && req.body.commentId) {
        var id = req.body.commentId;
        Comment.findById(id).exec(function(err, comment) {
            if (err) {
                return res.send(404, {
                    message: 'Invalid comment ' + id
                });
            }
            if (!comment) {
                return res.send(404, {
                    message: 'Failed to load comment ' + id
                });
            }

            // upvote and save, responding with total votes
            comment.upvote(req.user, function() {
                res.json({
                    votes: comment.upvotes()
                });
            });

            // Should anything happen here?
        });
    }
};

function ageInMinutes(comment) {
    return (Date.now() - comment.created.getTime()) / 60000;
}

/**
 * Comment authorization middleware
 */
exports.hasAuthorization = function(req, res, next) {
    // authorise edits for admin users, and creators for 10 minutes if there are no replies
    var ok = req.comment.user.id === req.user.id;
    ok = ok && ageInMinutes(req.comment) <= 10;
    ok = ok && !req.comment.replies || !req.comment.replies.length;
    ok = ok || _.contains(req.user.roles, 'admin');
    // debug(ok);
    // debug(ok = ok && ageInMinutes(req.comment) <= 10);
    // debug(ok = ok && !req.comment.replies || !req.comment.replies.length);
    // debug(ok = ok || _.contains(req.user.roles, 'admin'));

    if (ok) {
        next();
    } else {
        debug(403);
        return res.send(403, {
            message: 'User is not authorized'
        });
    }
};