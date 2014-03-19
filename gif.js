#!/usr/bin/env node

var _=require('underscore');

function Frame(params) {
	this.params=params || {};
	_.defaults(this.params,this.defaultParams);
}

_.extend(Frame.prototype,{
	defaultParams: {
		//gce
		disposalMethod: 0,
		userInputFlag: 0,
		transparentColorFlag: 0,
		transparentColorIndex: 0,
		duration: 100,
		
		//imageDescriptor
		left: 0,
		top: 0,
		width: 10,
		height: 10,
		interlaceFlag: 0,
		sortFlag: 0
		
		
	},
	localColorTableFlag: 0,
	writeToStream: function(s) {
		s.write(this.genGraphicsControlExtension());
		s.write(this.genImageDescriptor());
		
		if (this.localColorTableFlag) {
			s.write(this.genColorTable());
			s.write(new Buffer([this.localColorTableSize+1]));
		} else {
			s.write(new Buffer([this.parentGif.gctSize+1]));
		}

		var bs=this.getByteStream(this.getCodeStream(this.imageData));
		var at=0;
	
		while (bs.length-at>255) {
			s.write(new Buffer([255]));
			s.write(bs.slice(at,at+255));
			at+=255;
		}
		if (bs.length>at) {
			s.write(new Buffer([bs.length-at]));
			s.write(bs.slice(at));
		}
		
		s.write(new Buffer([0]));
	},
	genGraphicsControlExtension: function() {
		var params=this.params;
		var gce=new Buffer(8);
		var pos=0;
		
		gce.writeUInt8(0x21,pos++);
		gce.writeUInt8(0xf9,pos++);
		gce.writeUInt8(0x04,pos++);
		
		var gcePacked=(params.disposalMethod << 2) | (params.userInputFlag << 1) | params.transparentColorFlag;
		gce.writeUInt8(gcePacked,pos++);
		gce.writeUInt16LE(params.duration,pos);
		pos+=2;
		gce.writeUInt8(params.transparentColorIndex,pos++);
		gce.writeUInt8(0,pos++);
		
		return gce;
	},
	genImageDescriptor: function(params) {
		var params=this.params;
		var imageDescriptor=new Buffer(10);
		var pos=0;

		imageDescriptor.writeUInt8(0x2c,pos++);
		imageDescriptor.writeUInt16LE(params.left,pos);
		pos+=2;
		imageDescriptor.writeUInt16LE(params.top,pos);
		pos+=2;
		imageDescriptor.writeUInt16LE(params.width,pos);
		pos+=2;
		imageDescriptor.writeUInt16LE(params.height,pos);
		pos+=2;
		
		var packed=(this.localColorTableFlag<<7)
			| (params.interlaceFlag << 6)
			| (params.sortFlag << 5)
			| (this.localColorTableSize);
		imageDescriptor.writeUInt8(packed,pos++);
		
		return imageDescriptor;
	},
	getCodeStream: function(imageData) {			
		var indexBuffer=[];
		
		var codeStream=[];
		
		var nextId=this.initializeCodeTree();
		
		var imageDataAt=0;
		var treeNode=this.codeTree[imageData[imageDataAt++]];
		
		codeStream.push(this.clearCode);
		
		while(imageDataAt<imageData.length) {
			var k=imageData[imageDataAt++];
			if (typeof treeNode[k]==='undefined') {
				treeNode[k]={id: nextId++};
				codeStream.push(treeNode.id);
				if (nextId>=4095) {
					nextId=this.initializeCodeTree();
					codeStream.push(this.clearCode);
				}
				treeNode=this.codeTree[k];
			} else {
				treeNode=treeNode[k];
			}
		}
		codeStream.push(treeNode.id);
		codeStream.push(this.eoiCode);
		
		return codeStream;
	},
	getByteStream: function(cs) {
		var colorTableSize=this.localColorTableFlag?this.localColorTableSize:this.parentGif.gctSize;
		
		var codeSize=colorTableSize+2;
		var maxCode=(1<<codeSize)-1;
		var codeStart=(1<<(colorTableSize+1))+1;
		var byteStream=new Buffer(2* cs.length);
		var atByte=0;
		var curByte=0;
		var curBit=0;
		
		for(var i=0;i<cs.length;i++) {
			curByte |= (cs[i] << curBit);
			curBit+=codeSize;
			while(curBit>=8) {
				curBit-=8;
				byteStream.writeUInt8(curByte & 0xff,atByte++);
				curByte>>=8;
			}
			
			if (codeStart+i>maxCode) {
				codeSize++;
				maxCode=(1<<codeSize)-1;
			}
			
			if (cs[i]==this.clearCode) {
				var codeSize=colorTableSize+2;
				var maxCode=(1<<codeSize)-1;
				codeStart=(1<<(colorTableSize+1))+1-i;
			}
		}
		byteStream.writeUInt8(curByte,atByte++);
		
		return byteStream.slice(0,atByte);	
	},
	initializeCodeTree: function() {
		this.codeTree={id: -1, root: true};
		this.clearCode=1<<(this.localColorTableFlag?this.localColorTableSize:this.parentGif.gctSize) + 1;
		for(var i=0;i<this.clearCode;i++) {
			this.codeTree[i]={id: i};
		}
		this.eoiCode=this.clearCode+1;
		return this.eoiCode+1;
	},
	genColorTable: function() {
		var gct=new Buffer(3*(1 << (this.localColorTableSize +1)));
		gct.fill(0);
		
		for(var i=0;i<this.colorTable.length;i++) {
			gct.write(this.colorTable[i],i*3,3,'hex');
		}
		
		return gct;
	},
	addedTo: function(gif) {
		this.parentGif=gif;
	},
	setColorTable: function(colorTable) {
		this.colorTable=colorTable;
		this.localColorTableFlag=1;
		this.localColorTableSize=Math.floor(Math.log(this.colorTable.length-1)/Math.log(2));
	},
	setImageData: function(imageData) {
		this.imageData=imageData;
	}
	
});

function Gif(params) {
	this.params=params || {};
	_.defaults(this.params,this.paramDefaults);
	
	this.frames=[];
}

_.extend(Gif.prototype,{
	paramDefaults: {
		width: 10,
		height: 10,
		globalColorTableFlag: 1,
		colorResolution: 8,
		sortFlag: 0,
		bgColorIndex: 0,
		pixelRatio: 0,
		repeatCount: 0
	},
	writeToStream: function(s) {
		s.write(this.GIF_HEADER);
		
		s.write(this.genScreenDescriptor());
		s.write(this.genColorTable());
		
		if (this.frames.length> 1 && this.params.repeatCount>=0) {
			s.write(this.genRepeat(this.params.repeatCount));
		}
		
		_.each(this.frames,function(e,i) {
			e.writeToStream(s);
		});
			
		s.write(new Buffer([0x3b]));
	},
	genScreenDescriptor: function() {
		var params=this.params;
		
		var sd=new Buffer(7);
		
		sd.writeUInt16LE(params.width,0);
		sd.writeUInt16LE(params.height,2);
		
		var gctFlag=(params.globalColorTableFlag << 7) | (params.colorResolution-1 << 4) | (params.sortFlag << 3) | this.gctSize;
		sd.writeUInt8(gctFlag,4);
		sd.writeUInt8(params.bgColorIndex,5);
		sd.writeUInt8(params.pixelRatio,6);
		
		return sd;
	},
	genRepeat: function(times) {
		var b=new Buffer(3);
		b.writeUInt8(1,0);
		b.writeUInt16LE(times,1);
		
		return this.genApplicationSpecific("NETSCAPE2.0",b);
	},
	genApplicationSpecific: function(name,data) {		
		var r=new Buffer(name.length+data.length + 5);
		var pos=0;
		
		r.writeUInt8(0x21,pos++);
		r.writeUInt8(0xff,pos++);
		r.writeUInt8(name.length,pos++);
		r.write(name,3,name.length,'ascii');
		pos+=name.length;
		r.writeUInt8(data.length,pos++);
		data.copy(r,pos);
		pos+=data.length;
		r.writeUInt8(0,pos);
		
		return r;
	},
	genColorTable: function() {
		var gct=new Buffer(3*(1 << (this.gctSize +1)));
		gct.fill(0);
		
		for(var i=0;i<this.colorTable.length;i++) {
			gct.write(this.colorTable[i],i*3,3,'hex');
		}
		
		return gct;
	},
	addFrame: function(frame) {
		this.frames.push(frame);
		frame.addedTo(this);
	},
	setColorTable: function(colorTable) {
		this.colorTable=colorTable;
		this.gctSize=Math.floor(Math.log(this.colorTable.length-1)/Math.log(2));
	},
		
	GIF_HEADER: new Buffer([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
	colorTable: ['ffffff','ff0000','00ff00','0000ff','ffff00','ff00ff','00ffff','000000'],
	gctSize: 2
		
});

module.exports={
	Frame: Frame,
	Gif: Gif
};