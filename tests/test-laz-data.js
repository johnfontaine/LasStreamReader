/*jshint esversion: 6*/
const las = require('../src/las.js');
const chai = require('chai');
const expect = chai.expect;
const Writable = require("stream").Writable;
const fs = require("fs");
var lasStream = new las.LasStream();
var rs = fs.createReadStream("tests/sample_data/Barrow_SeaIce_May7_2008.laz", {autoClose : true});
describe("partially parse LAZ data and error", () => {
    it('should find LASF at start of header', ()=> {
        lasStream.on("onParseHeader", (header)=>{

            expect(header.file_signature).to.equal("LASF");
        });
    });
    it('should be laz', ()=>{
        lasStream.on("onParseVLR", (vlr) => {
            //    console.log("vlr's", vlr);
            expect(lasStream.is_laz).to.equal(true);
        });
    });
    it('should error', ()=>{
        try {
            rs.pipe(lasStream).pipe(new TestWritable());
        } catch (error) {
            expect(error).to.equal("laszip is not supported yet");
        }
    });
});
class TestWritable extends Writable {
  constructor(options) {
    // Calls the stream.Writable() constructor
    super({objectMode:true});
  }
  _write(chunk, encoding, callback) {
     if (Array.isArray(chunk)) {
         for (var point_record of chunk) {
             if (point_record.lat_lng) {
                // console.log(x++, point_record.lat_lng, point_record.scaled, point_record.raw);
             }
         }
     } else {
         console.log("error chunk is not array");
     }
     callback(null, 1);
  }
}
