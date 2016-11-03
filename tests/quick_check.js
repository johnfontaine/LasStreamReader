/*jshint esversion: 6*/
const las = require('../src/las.js');
const Writable = require("stream").Writable;
const fs = require("fs");
let x= 0;
let lasStream = new las.LasStreamReader({ transform_lnglat : true,
    projection : {epsg_datum : 32616 }
});
    lasStream.on("error", (error)=> {
        console.log("error", error);
    });
    lasStream.on("onParseHeader", (header)=>{
             console.log("onParseHeader", JSON.stringify(header, null, "\t" ));
     });
     lasStream.on("onParseVLR", (vlr) => {
         console.log("onParseVLR", JSON.stringify(vlr, null, "\t" ));

     });
     lasStream.on("onGotProjection", (projection)=> {
         console.log("onGotProjection", JSON.stringify(projection));
        //  if (projection.convert_to_wgs84 === null) {
        //      projection.epsg_datum = "EPSG:4326";
        //      projection.epsg_proj4 = '+proj=utm +zone=16 +ellps=WGS84 +datum=WGS84 +units=m +no_defs';
        //      projection.convert_to_wgs84 = new proj4(projection.epsg_proj4, proj4.defs('EPSG:4326'));
        //      console.log("no projection");
        //  }
    //     expect(projection.epsg_datum).to.equal('3717');
         //console.log(projection);
     });
     lasStream.on("onFinishedReadingRecords", (count)=> {
         console.log("****COUNT", count);
///        expect(count).to.equal(18658878);
    //    process.exit();
     });




class TestWritable extends Writable {
  constructor(options) {
    // Calls the stream.Writable() constructor
    super({objectMode:true});
  }
  _write(chunk, encoding, callback) {
     //if (Array.isArray(chunk)) {
         for (let point_record of chunk) {
             x++;
             if (point_record.lng_lat) {
                //console.log(x,point_record.lng_lat[1] +"," + point_record.lng_lat[0]);
             }
         }
     //} else {
     //     console.log("error chunk is not array");
     //}
//      console.log("got chunk...", JSON.stringify(chunk, null, " "));
     callback();
  }
}

const rs = fs.createReadStream("tests/sample_data/AL_ElmoreCo_2010_000136.las", {autoClose : true});
rs.pipe(lasStream).pipe(new TestWritable());
