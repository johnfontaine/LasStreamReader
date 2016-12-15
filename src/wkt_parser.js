"use strict";
/*
convert wkt to a json structure
*/
var match_tag = /^(\w+)\[/;
var match_string = /^\"([\w ]+)\"?/;
var match_digit = /^([\d.]+)/;
var loop = 0;

String.prototype.is_wkt = function() {
  return this.match(match_tag);
}
String.prototype.is_wkt_string = function() {
  let s =  this.match(match_string);
  if (s) {
    return s[1];
  }
  return false;
}
function split_data(data) {
  let results = [];
  let level = 0;
  let item = "";
  for (let char of data) {
    if (char === '[') {
      level++;
    } else if (char === ']') {
      level--;
    }
    if (char === ',' && level === 0) {
      results.push(String(item));
      item  = "";
    } else {
      item += char;
    }
  }
  results.push(item);
  return results;
}
function extract_key_and_values(wkt) {
  if (!wkt) {
    return false;
  }
  if (wkt.match(match_tag)) {
    let value = wkt.match(match_tag);
    let key = value[1];
    let data = wkt.substring(value[0].length);
    if (data.includes("]")) {
      data = data.substring(0, data.lastIndexOf("]")-1);
    }
    let result = {};
    if (key !== 'PARAMETER') {
      result[String(key)] = {'name': ""};
    }
    let items = split_data(data);
    let i = 0;
    let k2;
    for (let item of items) {
      if (item.is_wkt() ) {
        let item_result = extract_key_and_values(item);
        for (let item_key of Object.keys(item_result)) {
          result[key][item_key] = item_result[item_key];
        }
      } else if (item.is_wkt_string()) {
        if (i == 0) {
          if (key === 'PARAMETER') {
            k2 = item.is_wkt_string();
          } else {
            result[key].name = item.is_wkt_string();
          }
        } else {
          if (key === 'PARAMETER') {
            result[k2] = item.is_wkt_string();
          } else {
            result[key].value = item.is_wkt_string();
          }
        }
      } else {
        if (key === 'PARAMETER') {
          result[k2] = Number(item);
        } else {
          result[key].value = Number(item);
        }
      }
      i++;
    }
    return result;
  }
  return false;
}


module.exports = function(wkt) {
  wkt = wkt.replace(/\n*/mg, '');
  wkt = wkt.replace(/,\s+/g, ',');
  wkt = wkt.trim();
  let r = extract_key_and_values(wkt);
  return r;
}
