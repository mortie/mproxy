#!/usr/bin/env node

var confpath = process.env.PROXY_CONF;
if (!confpath)
	confpath = "/etc/mproxy";

var fs = require("fs");
var pathlib = require("path");
var urllib = require("url");
var mkdirp = require("mkdirp");
var userid = require("userid");
var certutil = require("./js/certutil");
var httputil = require("./js/httputil");
var pmutil = require("./js/pmutil");

var conf = JSON.parse(fs.readFileSync(confpath+"/conf.json"));

var sites = confpath+"/sites";
mkdirp.sync(sites);

function throwIfMissing(path, arr) {
	var missing = [];

	arr.forEach(elem => {
		if (elem[0] === undefined || elem[0] === null)
			missing.push(elem[1]);
	});

	if (missing.length > 0)
		throw "Missing keys "+missing.join(", ")+" at "+path;
}

function addAction(path, host, action) {
	throwIfMissing(path, [
		[host, "host"],
		[action, "action"]]);

	var url = urllib.parse(host);

	var port = url.port;
	var protocol = url.protocol;
	var domain = url.hostname;

	if (port === null) {
		if (protocol === "http:")
			port = 80;
		else if (protocol === "https:")
			port = 443;
	}

	try {
		httputil.host(conf, domain, port, protocol, action);
	} catch (err) {
		console.trace(err);
		throw err.toString()+" at "+path;
	}
}

function add(path, obj) {
	if (typeof obj !== "object")
		throw "Expected object, got "+(typeof obj)+" at "+path;

	var host = obj.host;

	// Allow multiple hosts, or just one host
	if (host instanceof Array) {
		host.forEach(h => {
			obj.host = h;
			addAction(path, h, obj.action);
		});
	} else if (typeof host === "string") {
		addAction(path, h, obj);
	}

	// Execute command
	if (typeof obj.exec === "object") {
		var exec = obj.exec;
		throwIfMissing(path, [
			[exec.at, "exec.at"],
			[exec.run, "exec.run"]]);

		// Add PORT env variable if proxy
		var env = exec.env || {};
		if (
				env.PORT === undefined &&
				obj.action !== undefined &&
				obj.action.type === "proxy") {

			var port = urllib.parse(obj.action.to).port;
			if (port)
				env.PORT = port;
		}

		// get GID and UID
		var user, group;
		var gid, uid;
		try {
			if (exec.group)
				group = exec.group;
			else
				group = conf.group;

			if (exec.user)
				user = exec.user;
			else
				user = conf.user;

			gid = userid.gid(group);
			uid = userid.uid(user);
		} catch (err) {
			console.error(
				err.toString()+" with user "+
				user+", group "+group+" at "+path);

			gid = null;
			uid = null;
		}

		if (gid !== null && uid !== null)
			pmutil.run(exec.at, exec.run, env, gid, uid);
	}
}

fs.readdirSync(sites).forEach(file => {
	var path = pathlib.join(sites, file);

	var site;
	try {
		site = JSON.parse(fs.readFileSync(path));
	} catch (err) {
		throw "Failed to parse "+path+": "+err.toString();
	}

	if (site instanceof Array)
		site.forEach(x => add(path, x));
	else if (typeof site == "object")
		add(path, site);
	else
		throw "Expected array or object, got "+(typeof site)+" at "+path;
});
