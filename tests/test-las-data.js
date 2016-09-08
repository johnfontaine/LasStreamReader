/*jshint esversion: 6*/
const las = require('../src/las.js');
const chai = require('chai');
const expect = chai.expect;
const Writable = require("stream").Writable;
const fs = require("fs");
let x= 0;
let lasStream = new las.LasStreamReader();
describe("parse las file", ()=> {

    lasStream.on("error", (error)=> {
        console.log("error", error);
    });
     it('should find LASF at start of header', ()=> {
         lasStream.on("onParseHeader", (header)=>{

             expect(header.file_signature).to.equal("LASF");
         });
     });
     it('should find reserved 43707 key at start of VLR record', ()=>{
         lasStream.on("onParseVLR", (vlr) => {
             expect(vlr[0].reserved).to.equal(43707);
         });
     });
     it("should find horizontal datum specified", ()=>{
         lasStream.on("onGotProjection", (projection)=> {
             //console.log("onGotProjection");
             expect(projection.epsg_datum).to.equal('3717');
             //console.log(projection);
         });
     });
     it("should have 18658878 records", ()=>{
         lasStream.on("onFinishedReadingRecords", (count)=> {
             console.log("****COUNT", count);
            expect(count).to.equal(18658878);
            done();
         });
     });
});



class TestWritable extends Writable {
  constructor(options) {
    // Calls the stream.Writable() constructor
    super({objectMode:true});
  }
  _write(chunk, encoding, callback) {
     if (Array.isArray(chunk)) {
         for (let point_record of chunk) {
             if (point_record.lat_lng) {
                // console.log(x++, point_record.lat_lng, point_record.scaled, point_record.raw);
             }

         }
     } else {
         console.log("error chunk is not array");
     }
     callback();
  }
}

const rs = fs.createReadStream("tests/sample_data/Haystack_Rock.las", {autoClose : true});
rs.pipe(lasStream).pipe(new TestWritable());
