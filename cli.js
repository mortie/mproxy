#!/usr/bin/env node

var confpath = process.env.PROXY_CONF;
if (!confpath)
	confpath = "/etc/tlsproxy";

var defaultGroup = "www-data";
var defaultUser = "www-data";

var fs = require("fs");
var net = require("net");
var mkdirp = require("mkdirp");

function copy(p1, p2) {
	var rs = fs.createWriteStream(p2);
	fs.createReadStream(p1).pipe(rs);
}

function fileExists(path) {
	try {
		fs.accessSync(path, fs.F_OK);
		return true;
	} catch (err) {
		return false;
	}
}

function ipcConn() {
	return net.createConnection(confpath+"/tlsproxy.sock");
}

var cmds = {
	"help": function() {
		console.log("Usage: "+process.argv[1]+" <command>");
		console.log("commands:");
		console.log("\thelp:      show this help text");
		console.log("\tsetup:     set up init scripts and conf file");
		console.log("\tproc-list: list processes managed by tlsproxy");
	},

	"setup": function() {
		if (process.platform !== "linux")
			return console.log("Setup only supports Linux.");

		mkdirp.sync(confpath);
		mkdirp.sync(confpath+"/sites");

		mkdirp.sync("/opt/tlsproxy");
		fs.symlinkSync(__dirname+"/daemon.js", "/opt/tlsproxy/daemon.js");

		// Default config
		if (!fileExists(confpath+"/conf.json")) {
			fs.writeFileSync(confpath+"/conf.json", JSON.stringify({
				email: "example@example.com",
				testing: false,
				group: defaultGroup,
				user: defaultUser
			}, null, 4));
			console.log(confpath+"/conf.json created. Please edit.");
		}

		var initpath = fs.realpathSync("/proc/1/exe");

		// systemd
		if (initpath.indexOf("systemd") != -1) {
			copy(
				__dirname+"/init/tlsproxy.service",
				"/etc/systemd/system/tlsproxy.service");
			console.log("tlsproxy installed.");
			console.log("Enable with 'systemctl enable tlsproxy',");
			console.log("then start with 'systemctl start tlsproxy'");
		} else {
			console.log("Systemd not detected, no unit file will be installed.")
		}
	},

	"proc-list": function() {
		var conn = ipcConn();
		conn.write("proc-list");
		conn.once("data", d => {
			var obj = JSON.parse(d);
			console.log("Processes:");
			obj.forEach(proc => {
				console.log(
					"id: "+proc.id+", "+
					"running: "+proc.running+", "+
					"command: "+proc.cmd);
			});
			process.exit();
		});
	}
};

if (cmds[process.argv[2]])
	cmds[process.argv[2]]();
else
	cmds.help();
