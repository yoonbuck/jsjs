/**
 * Unicode case-conversion and whitespace data. GENERATED FILE — DO NOT EDIT.
 *
 * Produced by `tools/unicode/generate-case-data.js`
 * (`npm run unicode:generate`) from the Unicode Character Database version
 * 16.0.0:
 *
 *   https://www.unicode.org/Public/16.0.0/ucd/UnicodeData.txt
 *     sha256 ff58e5823bd095166564a006e47d111130813dcf8bf234ef79fa51a870edb48f
 *   https://www.unicode.org/Public/16.0.0/ucd/SpecialCasing.txt
 *     sha256 8d5de354eef79f2395a54c9c7dcebbaf3d30fc962d0f85611ea97aa973a0c451
 *   https://www.unicode.org/Public/16.0.0/ucd/DerivedCoreProperties.txt
 *     sha256 39d35161f2954497f69e08bdb9e701493f476a3d30222de20028feda36c1dabd
 *
 * The version, base URL, and file names are pinned in `package.json`'s
 * `unicode` field; `npm run unicode:check` re-derives every table from those
 * files and fails if this module has drifted. Updating to a new Unicode
 * version is therefore a two-step change: edit the pin, rerun the generator.
 *
 * Every table is stored as text — space-separated hexadecimal numbers, `;`
 * between records — and decoded by this module's own scanner. That keeps the
 * data compact and keeps the String family free of any host
 * `String.prototype` parsing helper, which it is not allowed to use.
 */

/**
 * Simple lowercase mappings (UnicodeData.txt field 13), as `start stride
 * count delta` runs.
 */
const SIMPLE_LOWERCASE_RUNS = [
  '41 1 1a 20;c0 1 17 20;d8 1 7 20;100 2 18 1;130 1 1 -c7;132 2 3 1;139 2',
  ' 8 1;14a 2 17 1;178 1 1 -79;179 2 3 1;181 1 1 d2;182 2 2 1;186 1 1 ce;',
  '187 1 1 1;189 1 2 cd;18b 1 1 1;18e 1 1 4f;18f 1 1 ca;190 1 1 cb;191 1 ',
  '1 1;193 1 1 cd;194 1 1 cf;196 1 1 d3;197 1 1 d1;198 1 1 1;19c 1 1 d3;1',
  '9d 1 1 d5;19f 1 1 d6;1a0 2 3 1;1a6 1 1 da;1a7 1 1 1;1a9 1 1 da;1ac 1 1',
  ' 1;1ae 1 1 da;1af 1 1 1;1b1 1 2 d9;1b3 2 2 1;1b7 1 1 db;1b8 1 1 1;1bc ',
  '1 1 1;1c4 1 1 2;1c5 1 1 1;1c7 1 1 2;1c8 1 1 1;1ca 1 1 2;1cb 2 9 1;1de ',
  '2 9 1;1f1 1 1 2;1f2 2 2 1;1f6 1 1 -61;1f7 1 1 -38;1f8 2 14 1;220 1 1 -',
  '82;222 2 9 1;23a 1 1 2a2b;23b 1 1 1;23d 1 1 -a3;23e 1 1 2a28;241 1 1 1',
  ';243 1 1 -c3;244 1 1 45;245 1 1 47;246 2 5 1;370 2 2 1;376 1 1 1;37f 1',
  ' 1 74;386 1 1 26;388 1 3 25;38c 1 1 40;38e 1 2 3f;391 1 11 20;3a3 1 9 ',
  '20;3cf 1 1 8;3d8 2 c 1;3f4 1 1 -3c;3f7 1 1 1;3f9 1 1 -7;3fa 1 1 1;3fd ',
  '1 3 -82;400 1 10 50;410 1 20 20;460 2 11 1;48a 2 1b 1;4c0 1 1 f;4c1 2 ',
  '7 1;4d0 2 30 1;531 1 26 30;10a0 1 26 1c60;10c7 1 1 1c60;10cd 1 1 1c60;',
  '13a0 1 50 97d0;13f0 1 6 8;1c89 1 1 1;1c90 1 2b -bc0;1cbd 1 3 -bc0;1e00',
  ' 2 4b 1;1e9e 1 1 -1dbf;1ea0 2 30 1;1f08 1 8 -8;1f18 1 6 -8;1f28 1 8 -8',
  ';1f38 1 8 -8;1f48 1 6 -8;1f59 2 4 -8;1f68 1 8 -8;1f88 1 8 -8;1f98 1 8 ',
  '-8;1fa8 1 8 -8;1fb8 1 2 -8;1fba 1 2 -4a;1fbc 1 1 -9;1fc8 1 4 -56;1fcc ',
  '1 1 -9;1fd8 1 2 -8;1fda 1 2 -64;1fe8 1 2 -8;1fea 1 2 -70;1fec 1 1 -7;1',
  'ff8 1 2 -80;1ffa 1 2 -7e;1ffc 1 1 -9;2126 1 1 -1d5d;212a 1 1 -20bf;212',
  'b 1 1 -2046;2132 1 1 1c;2160 1 10 10;2183 1 1 1;24b6 1 1a 1a;2c00 1 30',
  ' 30;2c60 1 1 1;2c62 1 1 -29f7;2c63 1 1 -ee6;2c64 1 1 -29e7;2c67 2 3 1;',
  '2c6d 1 1 -2a1c;2c6e 1 1 -29fd;2c6f 1 1 -2a1f;2c70 1 1 -2a1e;2c72 1 1 1',
  ';2c75 1 1 1;2c7e 1 2 -2a3f;2c80 2 32 1;2ceb 2 2 1;2cf2 1 1 1;a640 2 17',
  ' 1;a680 2 e 1;a722 2 7 1;a732 2 1f 1;a779 2 2 1;a77d 1 1 -8a04;a77e 2 ',
  '5 1;a78b 1 1 1;a78d 1 1 -a528;a790 2 2 1;a796 2 a 1;a7aa 1 1 -a544;a7a',
  'b 1 1 -a54f;a7ac 1 1 -a54b;a7ad 1 1 -a541;a7ae 1 1 -a544;a7b0 1 1 -a51',
  '2;a7b1 1 1 -a52a;a7b2 1 1 -a515;a7b3 1 1 3a0;a7b4 2 8 1;a7c4 1 1 -30;a',
  '7c5 1 1 -a543;a7c6 1 1 -8a38;a7c7 2 2 1;a7cb 1 1 -a567;a7cc 1 1 1;a7d0',
  ' 1 1 1;a7d6 2 3 1;a7dc 1 1 -a641;a7f5 1 1 1;ff21 1 1a 20;10400 1 28 28',
  ';104b0 1 24 28;10570 1 b 27;1057c 1 f 27;1058c 1 7 27;10594 1 2 27;10c',
  '80 1 33 40;10d50 1 16 20;118a0 1 20 20;16e40 1 20 20;1e900 1 22 22',
].join('');

/**
 * Simple uppercase mappings (UnicodeData.txt field 12), as `start stride
 * count delta` runs.
 */
const SIMPLE_UPPERCASE_RUNS = [
  '61 1 1a -20;b5 1 1 2e7;e0 1 17 -20;f8 1 7 -20;ff 1 1 79;101 2 18 -1;13',
  '1 1 1 -e8;133 2 3 -1;13a 2 8 -1;14b 2 17 -1;17a 2 3 -1;17f 1 1 -12c;18',
  '0 1 1 c3;183 2 2 -1;188 1 1 -1;18c 1 1 -1;192 1 1 -1;195 1 1 61;199 1 ',
  '1 -1;19a 1 1 a3;19b 1 1 a641;19e 1 1 82;1a1 2 3 -1;1a8 1 1 -1;1ad 1 1 ',
  '-1;1b0 1 1 -1;1b4 2 2 -1;1b9 1 1 -1;1bd 1 1 -1;1bf 1 1 38;1c5 1 1 -1;1',
  'c6 1 1 -2;1c8 1 1 -1;1c9 1 1 -2;1cb 1 1 -1;1cc 1 1 -2;1ce 2 8 -1;1dd 1',
  ' 1 -4f;1df 2 9 -1;1f2 1 1 -1;1f3 1 1 -2;1f5 1 1 -1;1f9 2 14 -1;223 2 9',
  ' -1;23c 1 1 -1;23f 1 2 2a3f;242 1 1 -1;247 2 5 -1;250 1 1 2a1f;251 1 1',
  ' 2a1c;252 1 1 2a1e;253 1 1 -d2;254 1 1 -ce;256 1 2 -cd;259 1 1 -ca;25b',
  ' 1 1 -cb;25c 1 1 a54f;260 1 1 -cd;261 1 1 a54b;263 1 1 -cf;264 1 1 a56',
  '7;265 1 1 a528;266 1 1 a544;268 1 1 -d1;269 1 1 -d3;26a 1 1 a544;26b 1',
  ' 1 29f7;26c 1 1 a541;26f 1 1 -d3;271 1 1 29fd;272 1 1 -d5;275 1 1 -d6;',
  '27d 1 1 29e7;280 1 1 -da;282 1 1 a543;283 1 1 -da;287 1 1 a52a;288 1 1',
  ' -da;289 1 1 -45;28a 1 2 -d9;28c 1 1 -47;292 1 1 -db;29d 1 1 a515;29e ',
  '1 1 a512;345 1 1 54;371 2 2 -1;377 1 1 -1;37b 1 3 82;3ac 1 1 -26;3ad 1',
  ' 3 -25;3b1 1 11 -20;3c2 1 1 -1f;3c3 1 9 -20;3cc 1 1 -40;3cd 1 2 -3f;3d',
  '0 1 1 -3e;3d1 1 1 -39;3d5 1 1 -2f;3d6 1 1 -36;3d7 1 1 -8;3d9 2 c -1;3f',
  '0 1 1 -56;3f1 1 1 -50;3f2 1 1 7;3f3 1 1 -74;3f5 1 1 -60;3f8 1 1 -1;3fb',
  ' 1 1 -1;430 1 20 -20;450 1 10 -50;461 2 11 -1;48b 2 1b -1;4c2 2 7 -1;4',
  'cf 1 1 -f;4d1 2 30 -1;561 1 26 -30;10d0 1 2b bc0;10fd 1 3 bc0;13f8 1 6',
  ' -8;1c80 1 1 -186e;1c81 1 1 -186d;1c82 1 1 -1864;1c83 1 2 -1862;1c85 1',
  ' 1 -1863;1c86 1 1 -185c;1c87 1 1 -1825;1c88 1 1 89c2;1c8a 1 1 -1;1d79 ',
  '1 1 8a04;1d7d 1 1 ee6;1d8e 1 1 8a38;1e01 2 4b -1;1e9b 1 1 -3b;1ea1 2 3',
  '0 -1;1f00 1 8 8;1f10 1 6 8;1f20 1 8 8;1f30 1 8 8;1f40 1 6 8;1f51 2 4 8',
  ';1f60 1 8 8;1f70 1 2 4a;1f72 1 4 56;1f76 1 2 64;1f78 1 2 80;1f7a 1 2 7',
  '0;1f7c 1 2 7e;1f80 1 8 8;1f90 1 8 8;1fa0 1 8 8;1fb0 1 2 8;1fb3 1 1 9;1',
  'fbe 1 1 -1c25;1fc3 1 1 9;1fd0 1 2 8;1fe0 1 2 8;1fe5 1 1 7;1ff3 1 1 9;2',
  '14e 1 1 -1c;2170 1 10 -10;2184 1 1 -1;24d0 1 1a -1a;2c30 1 30 -30;2c61',
  ' 1 1 -1;2c65 1 1 -2a2b;2c66 1 1 -2a28;2c68 2 3 -1;2c73 1 1 -1;2c76 1 1',
  ' -1;2c81 2 32 -1;2cec 2 2 -1;2cf3 1 1 -1;2d00 1 26 -1c60;2d27 1 1 -1c6',
  '0;2d2d 1 1 -1c60;a641 2 17 -1;a681 2 e -1;a723 2 7 -1;a733 2 1f -1;a77',
  'a 2 2 -1;a77f 2 5 -1;a78c 1 1 -1;a791 2 2 -1;a794 1 1 30;a797 2 a -1;a',
  '7b5 2 8 -1;a7c8 2 2 -1;a7cd 1 1 -1;a7d1 1 1 -1;a7d7 2 3 -1;a7f6 1 1 -1',
  ';ab53 1 1 -3a0;ab70 1 50 -97d0;ff41 1 1a -20;10428 1 28 -28;104d8 1 24',
  ' -28;10597 1 b -27;105a3 1 f -27;105b3 1 7 -27;105bb 1 2 -27;10cc0 1 3',
  '3 -40;10d70 1 16 -20;118c0 1 20 -20;16e60 1 20 -20;1e922 1 22 -22',
].join('');

/**
 * Unconditional multi-character lowercase mappings (SpecialCasing.txt
 * field 1), as `codePoint length unit...` records.
 */
const SPECIAL_LOWERCASE_RECORDS = ['130 2 69 307'].join('');

/**
 * Unconditional multi-character uppercase mappings (SpecialCasing.txt
 * field 3), as `codePoint length unit...` records.
 */
const SPECIAL_UPPERCASE_RECORDS = [
  'df 2 53 53;149 2 2bc 4e;1f0 2 4a 30c;390 3 399 308 301;3b0 3 3a5 308 3',
  '01;587 2 535 552;1e96 2 48 331;1e97 2 54 308;1e98 2 57 30a;1e99 2 59 3',
  '0a;1e9a 2 41 2be;1f50 2 3a5 313;1f52 3 3a5 313 300;1f54 3 3a5 313 301;',
  '1f56 3 3a5 313 342;1f80 2 1f08 399;1f81 2 1f09 399;1f82 2 1f0a 399;1f8',
  '3 2 1f0b 399;1f84 2 1f0c 399;1f85 2 1f0d 399;1f86 2 1f0e 399;1f87 2 1f',
  '0f 399;1f88 2 1f08 399;1f89 2 1f09 399;1f8a 2 1f0a 399;1f8b 2 1f0b 399',
  ';1f8c 2 1f0c 399;1f8d 2 1f0d 399;1f8e 2 1f0e 399;1f8f 2 1f0f 399;1f90 ',
  '2 1f28 399;1f91 2 1f29 399;1f92 2 1f2a 399;1f93 2 1f2b 399;1f94 2 1f2c',
  ' 399;1f95 2 1f2d 399;1f96 2 1f2e 399;1f97 2 1f2f 399;1f98 2 1f28 399;1',
  'f99 2 1f29 399;1f9a 2 1f2a 399;1f9b 2 1f2b 399;1f9c 2 1f2c 399;1f9d 2 ',
  '1f2d 399;1f9e 2 1f2e 399;1f9f 2 1f2f 399;1fa0 2 1f68 399;1fa1 2 1f69 3',
  '99;1fa2 2 1f6a 399;1fa3 2 1f6b 399;1fa4 2 1f6c 399;1fa5 2 1f6d 399;1fa',
  '6 2 1f6e 399;1fa7 2 1f6f 399;1fa8 2 1f68 399;1fa9 2 1f69 399;1faa 2 1f',
  '6a 399;1fab 2 1f6b 399;1fac 2 1f6c 399;1fad 2 1f6d 399;1fae 2 1f6e 399',
  ';1faf 2 1f6f 399;1fb2 2 1fba 399;1fb3 2 391 399;1fb4 2 386 399;1fb6 2 ',
  '391 342;1fb7 3 391 342 399;1fbc 2 391 399;1fc2 2 1fca 399;1fc3 2 397 3',
  '99;1fc4 2 389 399;1fc6 2 397 342;1fc7 3 397 342 399;1fcc 2 397 399;1fd',
  '2 3 399 308 300;1fd3 3 399 308 301;1fd6 2 399 342;1fd7 3 399 308 342;1',
  'fe2 3 3a5 308 300;1fe3 3 3a5 308 301;1fe4 2 3a1 313;1fe6 2 3a5 342;1fe',
  '7 3 3a5 308 342;1ff2 2 1ffa 399;1ff3 2 3a9 399;1ff4 2 38f 399;1ff6 2 3',
  'a9 342;1ff7 3 3a9 342 399;1ffc 2 3a9 399;fb00 2 46 46;fb01 2 46 49;fb0',
  '2 2 46 4c;fb03 3 46 46 49;fb04 3 46 46 4c;fb05 2 53 54;fb06 2 53 54;fb',
  '13 2 544 546;fb14 2 544 535;fb15 2 544 53b;fb16 2 54e 546;fb17 2 544 5',
  '3d',
].join('');

/**
 * The Cased derived property (DerivedCoreProperties.txt), as `start end`
 * ranges. Used only by the Final_Sigma condition.
 */
const CASED_RANGES = [
  '41 5a;61 7a;aa aa;b5 b5;ba ba;c0 d6;d8 f6;f8 1ba;1bc 1bf;1c4 293;295 2',
  'b8;2c0 2c1;2e0 2e4;345 345;370 373;376 377;37a 37d;37f 37f;386 386;388',
  ' 38a;38c 38c;38e 3a1;3a3 3f5;3f7 481;48a 52f;531 556;560 588;10a0 10c5',
  ';10c7 10c7;10cd 10cd;10d0 10fa;10fc 10ff;13a0 13f5;13f8 13fd;1c80 1c8a',
  ';1c90 1cba;1cbd 1cbf;1d00 1dbf;1e00 1f15;1f18 1f1d;1f20 1f45;1f48 1f4d',
  ';1f50 1f57;1f59 1f59;1f5b 1f5b;1f5d 1f5d;1f5f 1f7d;1f80 1fb4;1fb6 1fbc',
  ';1fbe 1fbe;1fc2 1fc4;1fc6 1fcc;1fd0 1fd3;1fd6 1fdb;1fe0 1fec;1ff2 1ff4',
  ';1ff6 1ffc;2071 2071;207f 207f;2090 209c;2102 2102;2107 2107;210a 2113',
  ';2115 2115;2119 211d;2124 2124;2126 2126;2128 2128;212a 212d;212f 2134',
  ';2139 2139;213c 213f;2145 2149;214e 214e;2160 217f;2183 2184;24b6 24e9',
  ';2c00 2ce4;2ceb 2cee;2cf2 2cf3;2d00 2d25;2d27 2d27;2d2d 2d2d;a640 a66d',
  ';a680 a69d;a722 a787;a78b a78e;a790 a7cd;a7d0 a7d1;a7d3 a7d3;a7d5 a7dc',
  ';a7f2 a7f6;a7f8 a7fa;ab30 ab5a;ab5c ab69;ab70 abbf;fb00 fb06;fb13 fb17',
  ';ff21 ff3a;ff41 ff5a;10400 1044f;104b0 104d3;104d8 104fb;10570 1057a;1',
  '057c 1058a;1058c 10592;10594 10595;10597 105a1;105a3 105b1;105b3 105b9',
  ';105bb 105bc;10780 10780;10783 10785;10787 107b0;107b2 107ba;10c80 10c',
  'b2;10cc0 10cf2;10d50 10d65;10d70 10d85;118a0 118df;16e40 16e7f;1d400 1',
  'd454;1d456 1d49c;1d49e 1d49f;1d4a2 1d4a2;1d4a5 1d4a6;1d4a9 1d4ac;1d4ae',
  ' 1d4b9;1d4bb 1d4bb;1d4bd 1d4c3;1d4c5 1d505;1d507 1d50a;1d50d 1d514;1d5',
  '16 1d51c;1d51e 1d539;1d53b 1d53e;1d540 1d544;1d546 1d546;1d54a 1d550;1',
  'd552 1d6a5;1d6a8 1d6c0;1d6c2 1d6da;1d6dc 1d6fa;1d6fc 1d714;1d716 1d734',
  ';1d736 1d74e;1d750 1d76e;1d770 1d788;1d78a 1d7a8;1d7aa 1d7c2;1d7c4 1d7',
  'cb;1df00 1df09;1df0b 1df1e;1df25 1df2a;1e030 1e06d;1e900 1e943;1f130 1',
  'f149;1f150 1f169;1f170 1f189',
].join('');

/**
 * The Case_Ignorable derived property (DerivedCoreProperties.txt), as
 * `start end` ranges. Used only by the Final_Sigma condition.
 */
const CASE_IGNORABLE_RANGES = [
  '27 27;2e 2e;3a 3a;5e 5e;60 60;a8 a8;ad ad;af af;b4 b4;b7 b8;2b0 36f;37',
  '4 375;37a 37a;384 385;387 387;483 489;559 559;55f 55f;591 5bd;5bf 5bf;',
  '5c1 5c2;5c4 5c5;5c7 5c7;5f4 5f4;600 605;610 61a;61c 61c;640 640;64b 65',
  'f;670 670;6d6 6dd;6df 6e8;6ea 6ed;70f 70f;711 711;730 74a;7a6 7b0;7eb ',
  '7f5;7fa 7fa;7fd 7fd;816 82d;859 85b;888 888;890 891;897 89f;8c9 902;93',
  'a 93a;93c 93c;941 948;94d 94d;951 957;962 963;971 971;981 981;9bc 9bc;',
  '9c1 9c4;9cd 9cd;9e2 9e3;9fe 9fe;a01 a02;a3c a3c;a41 a42;a47 a48;a4b a4',
  'd;a51 a51;a70 a71;a75 a75;a81 a82;abc abc;ac1 ac5;ac7 ac8;acd acd;ae2 ',
  'ae3;afa aff;b01 b01;b3c b3c;b3f b3f;b41 b44;b4d b4d;b55 b56;b62 b63;b8',
  '2 b82;bc0 bc0;bcd bcd;c00 c00;c04 c04;c3c c3c;c3e c40;c46 c48;c4a c4d;',
  'c55 c56;c62 c63;c81 c81;cbc cbc;cbf cbf;cc6 cc6;ccc ccd;ce2 ce3;d00 d0',
  '1;d3b d3c;d41 d44;d4d d4d;d62 d63;d81 d81;dca dca;dd2 dd4;dd6 dd6;e31 ',
  'e31;e34 e3a;e46 e4e;eb1 eb1;eb4 ebc;ec6 ec6;ec8 ece;f18 f19;f35 f35;f3',
  '7 f37;f39 f39;f71 f7e;f80 f84;f86 f87;f8d f97;f99 fbc;fc6 fc6;102d 103',
  '0;1032 1037;1039 103a;103d 103e;1058 1059;105e 1060;1071 1074;1082 108',
  '2;1085 1086;108d 108d;109d 109d;10fc 10fc;135d 135f;1712 1714;1732 173',
  '3;1752 1753;1772 1773;17b4 17b5;17b7 17bd;17c6 17c6;17c9 17d3;17d7 17d',
  '7;17dd 17dd;180b 180f;1843 1843;1885 1886;18a9 18a9;1920 1922;1927 192',
  '8;1932 1932;1939 193b;1a17 1a18;1a1b 1a1b;1a56 1a56;1a58 1a5e;1a60 1a6',
  '0;1a62 1a62;1a65 1a6c;1a73 1a7c;1a7f 1a7f;1aa7 1aa7;1ab0 1ace;1b00 1b0',
  '3;1b34 1b34;1b36 1b3a;1b3c 1b3c;1b42 1b42;1b6b 1b73;1b80 1b81;1ba2 1ba',
  '5;1ba8 1ba9;1bab 1bad;1be6 1be6;1be8 1be9;1bed 1bed;1bef 1bf1;1c2c 1c3',
  '3;1c36 1c37;1c78 1c7d;1cd0 1cd2;1cd4 1ce0;1ce2 1ce8;1ced 1ced;1cf4 1cf',
  '4;1cf8 1cf9;1d2c 1d6a;1d78 1d78;1d9b 1dff;1fbd 1fbd;1fbf 1fc1;1fcd 1fc',
  'f;1fdd 1fdf;1fed 1fef;1ffd 1ffe;200b 200f;2018 2019;2024 2024;2027 202',
  '7;202a 202e;2060 2064;2066 206f;2071 2071;207f 207f;2090 209c;20d0 20f',
  '0;2c7c 2c7d;2cef 2cf1;2d6f 2d6f;2d7f 2d7f;2de0 2dff;2e2f 2e2f;3005 300',
  '5;302a 302d;3031 3035;303b 303b;3099 309e;30fc 30fe;a015 a015;a4f8 a4f',
  'd;a60c a60c;a66f a672;a674 a67d;a67f a67f;a69c a69f;a6f0 a6f1;a700 a72',
  '1;a770 a770;a788 a78a;a7f2 a7f4;a7f8 a7f9;a802 a802;a806 a806;a80b a80',
  'b;a825 a826;a82c a82c;a8c4 a8c5;a8e0 a8f1;a8ff a8ff;a926 a92d;a947 a95',
  '1;a980 a982;a9b3 a9b3;a9b6 a9b9;a9bc a9bd;a9cf a9cf;a9e5 a9e6;aa29 aa2',
  'e;aa31 aa32;aa35 aa36;aa43 aa43;aa4c aa4c;aa70 aa70;aa7c aa7c;aab0 aab',
  '0;aab2 aab4;aab7 aab8;aabe aabf;aac1 aac1;aadd aadd;aaec aaed;aaf3 aaf',
  '4;aaf6 aaf6;ab5b ab5f;ab69 ab6b;abe5 abe5;abe8 abe8;abed abed;fb1e fb1',
  'e;fbb2 fbc2;fe00 fe0f;fe13 fe13;fe20 fe2f;fe52 fe52;fe55 fe55;feff fef',
  'f;ff07 ff07;ff0e ff0e;ff1a ff1a;ff3e ff3e;ff40 ff40;ff70 ff70;ff9e ff9',
  'f;ffe3 ffe3;fff9 fffb;101fd 101fd;102e0 102e0;10376 1037a;10780 10785;',
  '10787 107b0;107b2 107ba;10a01 10a03;10a05 10a06;10a0c 10a0f;10a38 10a3',
  'a;10a3f 10a3f;10ae5 10ae6;10d24 10d27;10d4e 10d4e;10d69 10d6d;10d6f 10',
  'd6f;10eab 10eac;10efc 10eff;10f46 10f50;10f82 10f85;11001 11001;11038 ',
  '11046;11070 11070;11073 11074;1107f 11081;110b3 110b6;110b9 110ba;110b',
  'd 110bd;110c2 110c2;110cd 110cd;11100 11102;11127 1112b;1112d 11134;11',
  '173 11173;11180 11181;111b6 111be;111c9 111cc;111cf 111cf;1122f 11231;',
  '11234 11234;11236 11237;1123e 1123e;11241 11241;112df 112df;112e3 112e',
  'a;11300 11301;1133b 1133c;11340 11340;11366 1136c;11370 11374;113bb 11',
  '3c0;113ce 113ce;113d0 113d0;113d2 113d2;113e1 113e2;11438 1143f;11442 ',
  '11444;11446 11446;1145e 1145e;114b3 114b8;114ba 114ba;114bf 114c0;114c',
  '2 114c3;115b2 115b5;115bc 115bd;115bf 115c0;115dc 115dd;11633 1163a;11',
  '63d 1163d;1163f 11640;116ab 116ab;116ad 116ad;116b0 116b5;116b7 116b7;',
  '1171d 1171d;1171f 1171f;11722 11725;11727 1172b;1182f 11837;11839 1183',
  'a;1193b 1193c;1193e 1193e;11943 11943;119d4 119d7;119da 119db;119e0 11',
  '9e0;11a01 11a0a;11a33 11a38;11a3b 11a3e;11a47 11a47;11a51 11a56;11a59 ',
  '11a5b;11a8a 11a96;11a98 11a99;11c30 11c36;11c38 11c3d;11c3f 11c3f;11c9',
  '2 11ca7;11caa 11cb0;11cb2 11cb3;11cb5 11cb6;11d31 11d36;11d3a 11d3a;11',
  'd3c 11d3d;11d3f 11d45;11d47 11d47;11d90 11d91;11d95 11d95;11d97 11d97;',
  '11ef3 11ef4;11f00 11f01;11f36 11f3a;11f40 11f40;11f42 11f42;11f5a 11f5',
  'a;13430 13440;13447 13455;1611e 16129;1612d 1612f;16af0 16af4;16b30 16',
  'b36;16b40 16b43;16d40 16d42;16d6b 16d6c;16f4f 16f4f;16f8f 16f9f;16fe0 ',
  '16fe1;16fe3 16fe4;1aff0 1aff3;1aff5 1affb;1affd 1affe;1bc9d 1bc9e;1bca',
  '0 1bca3;1cf00 1cf2d;1cf30 1cf46;1d167 1d169;1d173 1d182;1d185 1d18b;1d',
  '1aa 1d1ad;1d242 1d244;1da00 1da36;1da3b 1da6c;1da75 1da75;1da84 1da84;',
  '1da9b 1da9f;1daa1 1daaf;1e000 1e006;1e008 1e018;1e01b 1e021;1e023 1e02',
  '4;1e026 1e02a;1e030 1e06d;1e08f 1e08f;1e130 1e13d;1e2ae 1e2ae;1e2ec 1e',
  '2ef;1e4eb 1e4ef;1e5ee 1e5ef;1e8d0 1e8d6;1e944 1e94b;1f3fb 1f3ff;e0001 ',
  'e0001;e0020 e007f;e0100 e01ef',
].join('');

/**
 * General category Zs (UnicodeData.txt field 2), as `start end` ranges.
 * This is the "other category Zs" clause of ES5 7.2's WhiteSpace
 * production, used by String.prototype.trim.
 */
const SPACE_SEPARATOR_RANGES = [
  '20 20;a0 a0;1680 1680;2000 200a;202f 202f;205f 205f;3000 3000',
].join('');

/** @type {Record<string, number>} */
const HEX_DIGITS = {
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  a: 10,
  b: 11,
  c: 12,
  d: 13,
  e: 14,
  f: 15,
};

/**
 * Decodes one encoded table into a flat array of numbers, reading it one code
 * unit at a time: hexadecimal digits accumulate into the current value, `-`
 * marks a negative value, and ` ` or `;` ends one. Record boundaries are
 * implied by each table's fixed shape, so only the numbers are needed here.
 *
 * @param {string} text
 * @returns {number[]}
 */
function decode(text) {
  /** @type {number[]} */
  const values = [];
  let value = 0;
  let digits = 0;
  let negative = false;

  for (let index = 0; index <= text.length; index += 1) {
    const unit = index < text.length ? text[index] : ' ';

    if (unit === '-') {
      negative = true;
      continue;
    }

    if (unit === ' ' || unit === ';') {
      if (digits > 0) {
        values.push(negative ? -value : value);
      }

      value = 0;
      digits = 0;
      negative = false;
      continue;
    }

    value = value * 16 + HEX_DIGITS[unit];
    digits += 1;
  }

  return values;
}

/** The Unicode version every table in this module was derived from. */
export const UNICODE_VERSION = '16.0.0';

/** Flat `start, stride, count, delta` quadruples. */
export const simpleLowercaseRuns = decode(SIMPLE_LOWERCASE_RUNS);

/** Flat `start, stride, count, delta` quadruples. */
export const simpleUppercaseRuns = decode(SIMPLE_UPPERCASE_RUNS);

/** Flat `codePoint, length, unit...` records. */
export const specialLowercaseRecords = decode(SPECIAL_LOWERCASE_RECORDS);

/** Flat `codePoint, length, unit...` records. */
export const specialUppercaseRecords = decode(SPECIAL_UPPERCASE_RECORDS);

/** Flat `start, end` pairs. */
export const casedRanges = decode(CASED_RANGES);

/** Flat `start, end` pairs. */
export const caseIgnorableRanges = decode(CASE_IGNORABLE_RANGES);

/** Flat `start, end` pairs. */
export const spaceSeparatorRanges = decode(SPACE_SEPARATOR_RANGES);
