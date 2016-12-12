/*jshint esversion: 6*/
const Uint64LE = require("int64-buffer").Uint64LE;
const Int64LE = require("int64-buffer").Int64LE;
function get_char_array(buffer, offset, length) {
    let array = new Uint8Array(buffer, offset, length);
    let data = "";
    for (let x of array) {
        let code = String.fromCharCode(x);
        if (code != '\u0000') {
            data = data + code;
        }
    }
    data = data.trim();
    return data;
}

function Header(buffer) {
    let dataView = new DataView(buffer);
    let position = 0;
    this.file_signature = get_char_array(buffer, 0, 4);
    position += 4;
    this.file_source_id = dataView.getUint16(position, true);
    position += 2;
    //todo decode global encoding bit
    this.global_encoding = dataView.getUint16(position, true);
    position += 2;
    this.project_id_guid_data = [
        dataView.getUint32(position, true),
        dataView.getUint16(position+4, true),
        dataView.getUint16(position+6, true),
        get_char_array(buffer, position+8, 8)
    ];
    position +=16;
    this.version = {};
    this.version.major = dataView.getUint8(position);
    position += 1;
    this.version.minor = dataView.getUint8(position);
    position += 1;
    this.system_identifier = get_char_array(buffer, position, 32);
    position += 32;
    this.generating_software = get_char_array(buffer, position, 32);
    position += 32;
    this.file_creation = {};
    this.file_creation.day_of_year = dataView.getUint16(position, true);
    position += 2;
    this.file_creation.year = dataView.getUint16(position, true);
    position += 2;
    this.header_size = dataView.getUint16(position, true);
    position += 2;
    this.offset_to_point_data = dataView.getUint32(position, true);
    position += 4;
    console.log("*****gettting variable length records: " + position + " " +  dataView.getUint32(position, true));
    this.number_of_variable_length_records =  dataView.getUint32(position, true);
    position += 4;
    this.point_data_record = {};
    this.point_data_record.format = dataView.getUint8(position);
    position += 1;
    this.point_data_record.length = dataView.getUint16(position, true);
    position += 2;
    if (this.version.major == 1) {
           let points = {};
           points.number_of_points = dataView.getUint32(position,true);
           position += 4;
           points.points_x_return = [
                dataView.getUint32(position,true),
                dataView.getUint32(position+4,true),
                dataView.getUint32(position+8,true),
                dataView.getUint32(position+12,true),
                dataView.getUint32(position+16,true)
           ];
           position +=20;
       if (this.version.minor < 4) {
           this.points = points;
       } else {
           this.legacy = points;
       }
    } else {
       throw new Error("Unsupported Version " + this.version.major + "." + this.version.minor);
    }
    this.scale = [];
    this.scale.push(dataView.getFloat64(position, true));
    position += 8;
    this.scale.push(dataView.getFloat64(position, true));
    position += 8;
    this.scale.push(dataView.getFloat64(position, true));
    position += 8;
    this.offset = [];
    this.offset.push(dataView.getFloat64(position, true));
    position += 8;
    this.offset.push(dataView.getFloat64(position, true));
    position += 8;
    this.offset.push(dataView.getFloat64(position, true));
    position += 8;
    this.max_min = [];
    this.max_min.push([
        dataView.getFloat64(position, true),
        dataView.getFloat64(position+8, true),
    ]);
    position += 16;
    this.max_min.push([
        dataView.getFloat64(position, true),
        dataView.getFloat64(position+8, true),
    ]);
    position += 16;
    this.max_min.push([
        dataView.getFloat64(position, true),
        dataView.getFloat64(position+8, true),
    ]);
    position += 16;
    if (this.version.minor == 4) {
        this.start_waveform_packet_record = new Uint64LE(buffer.slice(position, position+8));
        position +=8;
        this.variable_length_records = {};
        this.variable_length_records.start =new Uint64LE(buffer.slice(position, position+8));
        position +=8;
        this.variable_length_records.number = dataView.getUint32(position, true);
        position += 4;
        this.points = {
            number_of_points : new Uint64LE(buffer.slice(position, position+8)),
            points_x_return : []
        };
        position += 8;
        for (let i = 0; i < 15; i++) {
            this.points.points_x_return.push(new Uint64LE(buffer.slice(position, position+8)));
            position += 8;
        }
    }
}

Header.prototype.is_gps_time_type = function() {
    return this.global_encoding & 1;
};
Header.prototype.is_waveform_data_packets_internal = function () {
    return this.global_encoding & 1 << 1;
};
Header.prototype.is_waveform_data_packets_external = function() {
    return this.global_encoding & 1 << 2;
};
Header.prototype.is_return_numbers_synthetic = function() {
    return this.global_encoding & 1 << 3;
};
Header.prototype.is_wkt = function() {
    return this.global_encoding & 1 << 4;
};

function VariableLengthRecordHeader(buffer) {
    let dataView = new DataView(buffer);
    let position = 0;
    this.reserved = dataView.getUint16(position, true);
    position += 2;
    this.user_id = get_char_array(buffer, position, 16);
    position += 16;
    this.record_id = dataView.getUint16(position, true);
    position += 2;
    this.length_after_header = dataView.getUint16(position, true);
    position += 2;
    this.description = get_char_array(buffer, position, 32);
    this.record_length = this.length_after_header + 54;
    this.data = buffer.slice(54, this.record_length);
    if (String(this.record_id) === '34736' ) { //GeoDoubleParamsTag
        this.double_params = new Float64Array(this.data);
    } else if (String(this.record_id) === '34767') { //GeoAsciiParamsTag
        let char_aray =  new Uint8Array(this.data);
        this.string_params = [];
        let i = 0;
        this.string_params[0] = '';
        for (let x of char_array) {
            if (Number(x) === 0) {
                i++;
                this.string_params[i] = '';
            } else {
                this.string_params[i] = this.string_params[i] + String.fromCharCode(x);
            }
        }

    }

}
VariableLengthRecordHeader.prototype.is_projection = function() {
    return this.user_id.startsWith("LASF_Projection");
};
VariableLengthRecordHeader.prototype.is_classification_lookup = function() {
    return this.user_id.startsWith("LASF_Spec") && Number(this.record_id) === 0;
};
VariableLengthRecordHeader.prototype.is_text_area_description = function() {
    return this.user_id.startsWith("LASF_Spec") && Number(this.record_id) === 3;
};
VariableLengthRecordHeader.prototype.is_extra_bytes = function() {
    return this.user_id.startsWith("LASF_Spec") && Number(this.record_id) === 4;
};

function GeoKey(buffer) {
    let dataView = new DataView(buffer);
    let position = 0;
    this.wKeyDirectoryVersion = dataView.getUint16(position, true);
    position += 2;
    this.wKeyRevision = dataView.getUint16(position, true);
    position += 2;
    this.wMinorRevision = dataView.getUint16(position, true);
    position += 2;
    this.wNumberOfKeys = Number(dataView.getUint16(position, true));
    position += 2;
    this.keys = [];
    for (let i = 0; i < this.wNumberOfKeys; i++) {
        let key = {};
        key.wKeyId = dataView.getUint16(position, true);
        position += 2;
        key.wTIFFTagLocation  = dataView.getUint16(position, true);
        if (key.wTIFFTagLocation == 34736) {

        } else if (key.wTIFFTagLocation == 34767) {

        }
        position += 2;
        key.wCount = dataView.getUint16(position, true);
        position += 2;
        key.wValue_Offset  = dataView.getUint16(position, true);
        position += 2;
        this.keys.push(key);
    }

}
function computeScaled(item, scale, offset) {
  return (item * scale) + offset;
}

function PointRecord(buffer, header, point_record_options, projection) {
    let dataView = new DataView(buffer);
    this.raw = [
        dataView.getInt32(0, true),
        dataView.getInt32(4, true),
        dataView.getInt32(8, true),
    ];
    this.scaled = [
        computeScaled(this.raw[0], header.scale[0], header.offset[0]),
        computeScaled(this.raw[1], header.scale[1], header.offset[1]),
        computeScaled(this.raw[2], header.scale[2], header.offset[2]),
    ];
    if (point_record_options.transform_lnglat && projection && projection.convert_to_wgs84) {
        this.lng_lat = projection.convert_to_wgs84.forward(this.scaled.slice(0,2));
    }
    if (point_record_options.transform_lnglat && projection && projection.convert_elevation_to_meters) {
      this.elevation = projection.convert_elevation_to_meters(this.scaled[2]);
    }
    let position = 12;
    this.intensity = dataView.getUint16(position);
    position +=2;
    let bit = dataView.getInt8(position);
    this.return_number = bit >> 5;
    this.number_of_returns = ( bit << 3 ) >> 5;
    this.scan_direction_flag = bit & 2;
    this.edge_of_flight_line = bit & 1;
    position +=1;
    let classification = dataView.getInt8(position);

    this.classification = classification << 4;
    this.is_synthetic = classification & ( 1 << 3 );
    this.is_key_point = classification & (1 << 6 );
    this.is_withheld = classification & (1 << 7 );
    position +=1;
    this.scan_angle_rank = dataView.getUint8(position, true);
    position +=1;
    this.user_data = dataView.getInt8(position, true);
    position +=1;
    this.point_source_id = dataView.getUint16(position, true);


    // switch (header.point_data_record.format) {
    //     case 1:
    //       break;
    // }
}
const LAZZIP_CODER_ARITHMATIC = 0;
const LASZIP_CHUNK_SIZE_DEFAULT = 50000;
const LAZZIP_COMPRESSOR_NONE = 0;
const LASZIP_COMPRESSOR_POINTWISE = 1;
const LASZIP_COMPRESSOR_POINTWISE_CHUNKED = 2;
const LASZIP_COMPRESSOR_TOTAL_NUMBER_OF = 3;

function LazPointRecord(buffer, header, point_record_options, projection, last_record, laz_info) {
    let dataView = new DataView(buffer);

}
function ClassificationTable(buffer) {
    let dataView = new DataView(buffer);
    let position = 0;
    for (let i = 0; i < 255; i++) {
        position = i * 16;
        let classNumber = dataView.getUint8(position);
        let description = get_char_array(buffer, position+1, 15);
        this[String(classNumber)] = description;
    }
    console.log(this);
}
// Seehttps://github.com/LASzip/LASzip/blob/master/src/laszip.cpp
// the data of the LASzip VLR
//     U16  compressor         2 bytes
//     U16  coder              2 bytes
//     U8   version_major      1 byte
//     U8   version_minor      1 byte
//     U16  version_revision   2 bytes
//     U32  options            4 bytes
//     U32  chunk_size         4 bytes
//     I64  num_points         8 bytes
//     I64  num_bytes          8 bytes
//     U16  num_items          2 bytes
//        U16 type                2 bytes * num_items
//        U16 size                2 bytes * num_items
//        U16 version             2 bytes * num_items

function LazZipVlr(buffer) {
  let dataView = new DataView(buffer);
  let position = 0;
  this.compressor = dataView.getUint16(position, true);
  position += 2;
  this.coder = dataView.getUint16(position, true);
  position +=2;
  this.version = {};
  this.version.major = dataView.getUint8(position);
  position += 1;
  this.version.minor = dataView.getUint8(position);
  position += 1;
  this.version.revision = dataView.getUint16(position, true);
  position += 2;
  this.options = dataView.getUint32(position, true);
  position += 4;
  this.chunk_size = dataView.getUint32(position, true);
  position += 4;
  this.number_of_special_evlrs =  new Int64LE(buffer.slice(position, position+8));
  position += 8;
  this.offset_to_special_evlrs =  new Int64LE(buffer.slice(position, position+8));
  position += 8;
  this.num_items = dataView.getUint16(position, true);
  position += 2;
  this.items = [];
  for (let i = 0; i < this.num_items; i++ ) {
      let item = {};
      item.type = dataView.getUint16(dataView, position);
      position +=2;
      item.size = dataView.getUint16(dataView, position);
      position +=2;
      item.version = dataView.getUint16(dataView, position);
      position +=2;
      this.items[i] = item;
  }
}

module.exports = {
    Header : Header,
    GeoKey : GeoKey,
    PointRecord : PointRecord,
    VariableLengthRecordHeader : VariableLengthRecordHeader,
    ClassificationTable : ClassificationTable,
    LazZipVlr : LazZipVlr,
};
