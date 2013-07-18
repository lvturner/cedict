var fs = require('fs');
var colours = require('colors');
var sqlite3 = require('sqlite3').verbose();
var readline = require('readline');
var http = require('http');
var zlib = require('zlib');
var replMode = false;

var rl = readline.createInterface({
  input: process.stdin,
    output: process.stdout
});

function getUserHome() {
  return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
}

exports.start = function(args) {
  if(!fs.existsSync(getUserHome() + "/cedict/cedict.sqlite3")) {
    var reqData = "";
    var unzippedData;
    var request = http.get("http://www.mdbg.net/chindict/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz");
    if(!fs.existsSync(getUserHome() + "/cedict/")) {
      fs.mkdirSync(getUserHome() + "/cedict/");
    }
    request.on('data', function() {
      process.stdout.write(".");
    });
    request.on('error', function() {
      console.log("Error downloading dictionary");
    });
    request.on('response', function(response) {
      var output = fs.createWriteStream(getUserHome() + '/cedict/cedict_ts.u8');
      response.pipe(zlib.createGunzip()).pipe(output);
      response.on('end', function() {
        buildDB();
      });
    });
    console.log("Downloading dictionary, please standby");
  } else if (args.length > 2)  {
    var search_string = "";
    for(var i = 2;i<args.length;i++) {
      search_string += args[i] + "%";
    }
    findDefinitions(search_string);
  } else {
    repl();
  }
}

function buildDB() {
  var newDb = new sqlite3.Database("cedict.sqlite3");
  var fileContents = fs.readFileSync('cedict_ts.u8');
  var entries = fileContents.toString().split('\n');
  console.log("Building database");
  
  // actually, using a regex is a bad idea 
  // http://eli.thegreenplace.net/2013/07/16/hand-written-lexer-in-javascript-compared-to-the-regex-based-ones/
  // but I found this regex here https://github.com/Tropi/php-cedict/blob/master/cedict2mysql.php
  // and I really don't want to spend too long getting a working version of this up and running
  var regex = /(.*?) (.*?) \[(.*?)\] \/(.*)\//;
  newDb.run("CREATE TABLE dict (id  INTEGER PRIMARY KEY AUTOINCREMENT, traditional VARCHAR(50), simplified  VARCHAR(50), pinyin      VARCHAR(100), english     VARCHAR(500) )"); 
  newDb.serialize(function() {
    var transact = newDb.prepare("INSERT INTO dict(traditional, simplified, pinyin, english) VALUES(?, ?, ?, ?)");
    for(var index in entries) {
      if(entries[index].indexOf("#") != 0) {
        var parsedEntry = entries[index].match(regex);
        if(parsedEntry != null) {
          transact.run(parsedEntry[1], parsedEntry[2], parsedEntry[3], parsedEntry[4]);
        }
      }
    } 
    transact.finalize(function() {
      process.stdout.write("\nDone!");
      newDb.close();
      fs.unlink('cedict_ts.u8');
      repl();
    });
  });
}

function repl() {
  replMode = true;
  rl.setPrompt("=> ");
  rl.prompt(true);

  rl.on('line', function(line) {
    findDefinitions(line);
  }); 
}

function findDefinitions(line) {
  line = line.replace(" ", "%");
  var db = new sqlite3.Database("cedict.sqlite3");
  var selector = line + "%";
  db.each("SELECT traditional, simplified, pinyin, english FROM dict WHERE traditional LIKE ? OR simplified LIKE ? OR pinyin LIKE ? or english LIKE ? LIMIT 5", selector, selector, selector, "%" + selector, function(err, entry) {
    if(err) return;
    console.log();
    console.log(entry["simplified"] + " [ ".bold + entry["traditional"] + " ]".bold);
    var pinyin = entry["pinyin"].split(' ');
    var outputPinyin = "";
    for(var i in pinyin) {
      if(pinyin[i].indexOf("1") != -1) { 
        outputPinyin += pinyin[i].red + " "; 
      } else if (pinyin[i].indexOf("2") != -1) { 
        outputPinyin += pinyin[i].yellow + " "; 
      } else if(pinyin[i].indexOf("3") != -1) { 
        outputPinyin += pinyin[i].green + " "; 
      } else if(pinyin[i].indexOf("4") != -1) { 
        outputPinyin += pinyin[i].cyan + " "; 
      } else {
        outputPinyin += pinyin[i];
      }
    }
    console.log(outputPinyin);
    var english = entry["english"].split('/');
    for(var i in english) {
      console.log((parseInt(i) + 1) + ". " + english[i]);
    }
  }, function() {
    if(replMode) {
      rl.prompt(true);
    } else {
      db.close();
      process.exit();
    }
  });
}
