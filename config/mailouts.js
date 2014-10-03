'use strict';

var nodemailer = require('nodemailer'),
    config = require('./config'),
    production = process.env.NODE_ENV === 'production',
    mongoose = require('mongoose'),
    User = mongoose.model('User'),
    _ = require('lodash'),
    smtpTransport;

var debug = require('debug')('comments');
var util = require('util');

//
// Update the mail sender and the moderators list every so often
//
var sender = '';
var moderators = '';

function setSenderAndModerators() {
    User
        .findOne({
            roles: 'sender'
        })
        .select('email')
        .exec(function(err, user) {
            if (err) {
                debug('error ' + err + 'finding designated mailout sender');
            } else {
                if (user) {
                    sender = user.email;
                } else {
                    sender = 'gmp26@cam.ac.uk';
                    debug('no sender assigned: using ' + sender);
                }
                debug('sender = ' + sender);
            }
        });

    User
        .find({
            roles: 'moderator'
        })
        .select('email')
        .exec(function(err, mods) {
            if (err) return;
            moderators = _.map(mods, 'email').join(', ');
            if (moderators.length === 0) {
                moderators = 'gmp26@cam.ac.uk';
                debug('no moderators assigned: using ' + moderators);
            }
            debug('moderators = ' + moderators);
        });
}
setSenderAndModerators();
setInterval(setSenderAndModerators, 15000);


if (production) {
    smtpTransport = nodemailer.createTransport('SMTP');
} else {
    smtpTransport = nodemailer.createTransport('SMTP', {
        host: 'smtp.hermes.cam.ac.uk',
        port: 587,
        debug: true,
        auth: {
            user: process.env.crsid,
            pass: process.env.hermesPassword
        }
    });
}

function spotUrl(spotId) {
    var m;
    var apath;
    //debug('spotId=' + spotId);
    apath = spotId + (spotId.match('/resources/') ? '/index.html' : '.html');

    m = spotId.match(/(fenman)|(bittern)|(swanage)/);
    if (m)
        return 'https://cmep.maths.org/' + apath;
    else
        return 'http://localhost:9000' + apath;
}

function addReason(text) {
    return text + '\nYou are receiving this email because you are a CMEP comment moderator.';
}

module.exports = {

    sendMail: smtpTransport.sendMail,

    setSenderAndModerators: setSenderAndModerators,

    sendOneTimePassword: function(toEmail, oneTimePassword) {
        return {
            from: sender,
            to: toEmail,
            subject: 'CMEP Password Reset Request',
            html: '<p>We received a password reset request for your CMEP account.</p>' +
                '<p>A new password has been generated for you which is good ' +
                'for one sign-in only within the next hour. ' +
                'Your one-time password is</p>' +
                '<div style="font-weight:bold;font-size:1.8em">' + oneTimePassword + '</div>' +
                '<p>Please sign in with this password. ' +
                'You will then be redirected to a page where you can choose a new password</p>' +
                '<p>If this password has already expired, you will be given an opportunity to request another.</p>'
        };
    },

    newCommentNotification: function(comment, user) {
        return {
            from: sender,
            to: moderators,
            subject: 'cmepc ' + user.displayName + ' commented on ' + spotUrl(comment.spotId),
            text: addReason(
                'from: ' + user.email + '\n title:' + comment.title + '\n\n' + comment.content
            )
        };
    },

    newReplyNotification: function(comment, user, reply) {
        return {
            from: sender,
            to: moderators,
            subject: 'cmepc new reply to ' + comment.title + ' at ' + spotUrl(comment.spotId),
            text: addReason(reply)
        };
    },

    editNotification: function(comment, editingUser, oldComment) {
        return {
            from: sender,
            to: moderators,
            subject: 'cmepc ' + editingUser.email + ' edited comment at ' + spotUrl(comment.spotId),
            text: addReason(
                'OLD\n===\n' + util.inspect(oldComment) + '\nNEW\n===\n' + util.inspect(comment)
            )
        };
    },

    deleteNotification: function(comment, deletingUser) {
        return {
            from: sender,
            to: moderators,
            subject: 'cm!d ' + deletingUser.email + ' deleted comment at ' + spotUrl(comment.spotId),
            text: addReason(
                util.inspect(comment)
            )
        };
    }
};