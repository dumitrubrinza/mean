mean
====

This repo contains the CMEP server which provides the API for commenting services. It's based on the [MEAN.JS stack](http://meanjs.org/). Refer to that site for further details. The code here is a modified version of [MEAN](https://github.com/meanjs/mean), so its README is relevant.

## Quick start

Prerequisites are the usual CMEP git/node/grunt tools plus an installation of MongoDB.

```
$ git clone https://github.com/meanjs/mean.git meanjs
$ npm install
$ grunt
```

## Server installation

Install in /www/cmep/services/mean and then configure in Apache as a reverse proxy.
```
ProxyPass /mean/ http://localhost:3000/ nocanon
ProxyPassReverse /mean/ http://localhost:3000/
```
No further configuration is required to enable emails. 

## Local installation

If running on a local test system
you will need to provide hermes login credentials in order to test mailouts. Do this by defining environment variables before running the server.
```
$ git clone https://github.com/meanjs/mean.git meanjs
$ npm install
export crsid=???
export hermesPassword=????????
grunt
```

## Local testing
Start the CMEP local server with
```
$ grunt server:mean
```
The extra :mean parameter tells the server to redirect all /mean urls to the local commenting server.


## Development tests
A direct interface to the mean server is available at localhost:3000
