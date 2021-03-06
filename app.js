#!/usr/bin/env node

'use strict'

var http = require('http');
var fs = require('fs');
var piIndexScanner = require(__dirname + '/lib/indexScanner.js');

var portNumber = 31415;

var indexDir = (process.argv[2] || __dirname + "/index/");
indexDir = (indexDir[indexDir.length-1] === '/' ? indexDir : indexDir + '/');
var digitsFile = (process.argv[3] || __dirname + "/pi-digits");

var log = function(message) {
  fs.appendFile(__dirname + '/../piScanner_log.txt', (new Date()).toGMTString() + ' : ' + message + '\n');
  console.log((new Date()).toGMTString() + ' : ' + message);
};

var canned_responses = {

  malformed_query: function(res, req) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      'status': 'Error 400',
      'message': 'Invalid query'
    }));
    log('Rejected request ' + req.method + ' : ' + req.url);
  },

  bad_range: function(res, req) {
    res.writeHead(422, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      'status': 'Error 422',
      'message': 'Range invalid: maybe too high or too low.'
    }));
    log('Rejected request ' + req.method + ' : ' + req.url);
  },

  too_many_digits: function(res, req) {
    res.writeHead(403, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      'status': 'Error 403',
      'message': 'Too many digits requested, max range is 100000.'
    }));
    log('Rejected request ' + req.method + ' : ' + req.url);
  },

  nothing_here: function(res, req) {
    res.writeHead(404, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      'status': 'Error 404',
      'message': 'Nothing to see here'
    }));
    log('Rejected request ' + req.method + ' : ' + req.url);
  },

  bad_request: function(res, req) {
    res.writeHead(405, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      'status': 'Error 405',
      'message': 'Invalid request.'
    }));
    log('Rejected request ' + req.method + ' : ' + req.url);
  },

  serve_asset: function(res, req) {
    var file_path, fileStat, file, mimeType;
    if (req.url === '' || req.url === '/') {
      file_path = __dirname + "/www/index.html";
    } else {
      file_path = __dirname + "/www" + req.url;
    }
    if (fs.existsSync(file_path)) {
      fileStat = fs.lstatSync(file_path);
      if (fileStat.isFile(file_path)) {
        switch (file_path.split('.').slice(-1).pop()) {
          case 'html':
            mimeType = 'text/html';
            break;
          case 'js':
            mimeType = 'application/javascript';
            break;
          case 'css':
            mimeType = 'text/css';
            break;
          default:     mimeType = 'text/plain';
        }

        file = fs.readFileSync(file_path);
        res.writeHead(200, {'Content-Type': mimeType});
        res.end(file);
      } else if (fileStat.isDirectory()) {
        res.writeHead(403, {'Content-Type': 'text/plain'});
        res.end("403: What are you playing at?");
      } else {
        this.nothing_here(res, req);
      }
    } else {
      this.nothing_here(res, req);
    }
  }
}



http.createServer(function (req, res) {
  var path = req.url.split('/');
  var query, start, end;

  if (req.method === 'GET') {

    switch (path[1]) {
      case 'find':
        query = /^\d+$/.exec(path[2]);

        if (path.length === 3 && query) {
          query = query[0]
          log('Recieved request from: ' + req.connection.remoteAddress + ' for: '+ req.url);
          res.writeHead(200, {'Content-Type': 'application/json'});

          var t0 = new Date().getTime();
          piIndexScanner.scanPiFor(query, indexDir, digitsFile, function(result) {
            var td = (new Date().getTime() - t0) / 1000;
            if (result + 1) {
              res.end(JSON.stringify({
                status: 'success',
                query: query,
                result: result,
                time: td
              }));
            } else {
              res.end(JSON.stringify({
                status: 'not found',
                query: query,
                result: result,
                time: td
              }));
            }
            log('Fulfilled request ' + query + ' => ' + result);
          });

        } else {
          canned_responses.malformed_query(res, req);
        }
        break;

      case 'range':
        log('Recieved request from:' + req.connection.remoteAddress + ' for: '+ req.url);

        query = /^(\d+):(\d+)$/.exec(path[2]);
        if (path.length !== 3 || !query) {
          canned_responses.malformed_query(res, req);
        } else {
          start = parseInt(query[1]);
          end = parseInt(query[2]);
        }

        if (start < 0 || end <= start || end > fs.statSync(digitsFile).size) {
          canned_responses.bad_range(res, req);
        } else if (end - start > 100000) { // requests for more that 100000 digits are forbidden
          canned_responses.too_many_digits(res, req);
        } else {
          res.writeHead(200, {'Content-Type': 'application/json'});
          var t0 = new Date().getTime();
          piIndexScanner.digitRange(start, end, digitsFile, function(digits) {
            var td = (new Date().getTime() - t0) / 1000;
            res.end(JSON.stringify({
              status: 'success',
              query: [start, end],
              result: digits,
              time: td
            }));
          });
        }
        break;

      default:
        canned_responses.serve_asset(res, req);
    }

  } else {
    // we only like GET requests
    canned_responses.bad_request(res, req);
  }
}).listen(portNumber);

log('Launched app');


console.log('Started web server on port ' + portNumber + ', on ' + (new Date()).toGMTString());
console.log('Accepting requests like http://127.0.0.1:' + portNumber + '/find/1415');
console.log(' Or like http://127.0.0.1:' + portNumber + '/range/100:200');
