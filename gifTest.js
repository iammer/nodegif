#!/usr/bin/env node

var fs=require('fs');
var gif=require('./gif.js');

var out=fs.createWriteStream('out.gif');
var g=new gif.Gif({
	width: 500,
	height: 500
});

g.setColorTable(['000000','000000','000000','000000','000000','000000','000000','000000']);

for (var i=0;i<20;i++) {
	var f=new gif.Frame({
		top: i*20,
		left: i*20,
		width: 50,
		height: 50,
		disposalMethod: 2,
		duration: 10
	});
	
	f.setColorTable(['ffffff','ff0000','00ff00','0000ff','ffff00','ff00ff','00ffff','000000']);
	
	var imageData=new Array(2500);
	for(var j=0;j<2500;j++) {
		imageData[j]=Math.floor((j/1000+i))%8;//Math.floor(Math.random()*8);
	}
	f.setImageData(imageData);
	
	g.addFrame(f);
}


g.writeToStream(out);
out.end();

