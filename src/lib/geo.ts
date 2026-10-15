// Countries and their states or regions, for the church address.
//
// Country names are fixed here, not read from Intl at runtime: Node and
// browsers name a few countries differently, which would break hydration.
// States are listed for the countries churches are most likely to sign up
// from; anywhere else the state is typed in.

const NAMES: Record<string, string> = {
  AF: "Afghanistan", AX: "Åland Islands", AL: "Albania", DZ: "Algeria", AS: "American Samoa", AD: "Andorra",
  AO: "Angola", AI: "Anguilla", AQ: "Antarctica", AG: "Antigua & Barbuda", AR: "Argentina", AM: "Armenia",
  AW: "Aruba", AU: "Australia", AT: "Austria", AZ: "Azerbaijan", BS: "Bahamas", BH: "Bahrain", BD: "Bangladesh",
  BB: "Barbados", BY: "Belarus", BE: "Belgium", BZ: "Belize", BJ: "Benin", BM: "Bermuda", BT: "Bhutan",
  BO: "Bolivia", BA: "Bosnia & Herzegovina", BW: "Botswana", BV: "Bouvet Island", BR: "Brazil",
  IO: "British Indian Ocean Territory", VG: "British Virgin Islands", BN: "Brunei", BG: "Bulgaria",
  BF: "Burkina Faso", BI: "Burundi", KH: "Cambodia", CM: "Cameroon", CA: "Canada", CV: "Cape Verde",
  BQ: "Caribbean Netherlands", KY: "Cayman Islands", CF: "Central African Republic", TD: "Chad", CL: "Chile",
  CN: "China", CX: "Christmas Island", CC: "Cocos (Keeling) Islands", CO: "Colombia", KM: "Comoros",
  CG: "Congo - Brazzaville", CD: "Congo - Kinshasa", CK: "Cook Islands", CR: "Costa Rica", CI: "Côte d’Ivoire",
  HR: "Croatia", CU: "Cuba", CW: "Curaçao", CY: "Cyprus", CZ: "Czechia", DK: "Denmark", DJ: "Djibouti",
  DM: "Dominica", DO: "Dominican Republic", EC: "Ecuador", EG: "Egypt", SV: "El Salvador", GQ: "Equatorial Guinea",
  ER: "Eritrea", EE: "Estonia", SZ: "Eswatini", ET: "Ethiopia", FK: "Falkland Islands", FO: "Faroe Islands",
  FJ: "Fiji", FI: "Finland", FR: "France", GF: "French Guiana", PF: "French Polynesia",
  TF: "French Southern Territories", GA: "Gabon", GM: "Gambia", GE: "Georgia", DE: "Germany", GH: "Ghana",
  GI: "Gibraltar", GR: "Greece", GL: "Greenland", GD: "Grenada", GP: "Guadeloupe", GU: "Guam", GT: "Guatemala",
  GG: "Guernsey", GN: "Guinea", GW: "Guinea-Bissau", GY: "Guyana", HT: "Haiti", HM: "Heard & McDonald Islands",
  HN: "Honduras", HK: "Hong Kong SAR China", HU: "Hungary", IS: "Iceland", IN: "India", ID: "Indonesia", IR: "Iran",
  IQ: "Iraq", IE: "Ireland", IM: "Isle of Man", IL: "Israel", IT: "Italy", JM: "Jamaica", JP: "Japan", JE: "Jersey",
  JO: "Jordan", KZ: "Kazakhstan", KE: "Kenya", KI: "Kiribati", KW: "Kuwait", KG: "Kyrgyzstan", LA: "Laos",
  LV: "Latvia", LB: "Lebanon", LS: "Lesotho", LR: "Liberia", LY: "Libya", LI: "Liechtenstein", LT: "Lithuania",
  LU: "Luxembourg", MO: "Macao SAR China", MG: "Madagascar", MW: "Malawi", MY: "Malaysia", MV: "Maldives",
  ML: "Mali", MT: "Malta", MH: "Marshall Islands", MQ: "Martinique", MR: "Mauritania", MU: "Mauritius",
  YT: "Mayotte", MX: "Mexico", FM: "Micronesia", MD: "Moldova", MC: "Monaco", MN: "Mongolia", ME: "Montenegro",
  MS: "Montserrat", MA: "Morocco", MZ: "Mozambique", MM: "Myanmar (Burma)", NA: "Namibia", NR: "Nauru", NP: "Nepal",
  NL: "Netherlands", NC: "New Caledonia", NZ: "New Zealand", NI: "Nicaragua", NE: "Niger", NG: "Nigeria", NU: "Niue",
  NF: "Norfolk Island", KP: "North Korea", MK: "North Macedonia", MP: "Northern Mariana Islands", NO: "Norway",
  OM: "Oman", PK: "Pakistan", PW: "Palau", PS: "Palestinian Territories", PA: "Panama", PG: "Papua New Guinea",
  PY: "Paraguay", PE: "Peru", PH: "Philippines", PN: "Pitcairn Islands", PL: "Poland", PT: "Portugal",
  PR: "Puerto Rico", QA: "Qatar", RE: "Réunion", RO: "Romania", RU: "Russia", RW: "Rwanda", WS: "Samoa",
  SM: "San Marino", ST: "São Tomé & Príncipe", SA: "Saudi Arabia", SN: "Senegal", RS: "Serbia", SC: "Seychelles",
  SL: "Sierra Leone", SG: "Singapore", SX: "Sint Maarten", SK: "Slovakia", SI: "Slovenia", SB: "Solomon Islands",
  SO: "Somalia", ZA: "South Africa", GS: "South Georgia & South Sandwich Islands", KR: "South Korea",
  SS: "South Sudan", ES: "Spain", LK: "Sri Lanka", BL: "St. Barthélemy", SH: "St. Helena", KN: "St. Kitts & Nevis",
  LC: "St. Lucia", MF: "St. Martin", PM: "St. Pierre & Miquelon", VC: "St. Vincent & Grenadines", SD: "Sudan",
  SR: "Suriname", SJ: "Svalbard & Jan Mayen", SE: "Sweden", CH: "Switzerland", SY: "Syria", TW: "Taiwan",
  TJ: "Tajikistan", TZ: "Tanzania", TH: "Thailand", TL: "Timor-Leste", TG: "Togo", TK: "Tokelau", TO: "Tonga",
  TT: "Trinidad & Tobago", TN: "Tunisia", TR: "Türkiye", TM: "Turkmenistan", TC: "Turks & Caicos Islands",
  TV: "Tuvalu", UM: "U.S. Outlying Islands", VI: "U.S. Virgin Islands", UG: "Uganda", UA: "Ukraine",
  AE: "United Arab Emirates", GB: "United Kingdom", US: "United States", UY: "Uruguay", UZ: "Uzbekistan",
  VU: "Vanuatu", VA: "Vatican City", VE: "Venezuela", VN: "Vietnam", WF: "Wallis & Futuna", EH: "Western Sahara",
  YE: "Yemen", ZM: "Zambia", ZW: "Zimbabwe",
};

export const DEFAULT_COUNTRY = "NG";

export interface Country {
  code: string;
  name: string;
}

/** Every country in alphabetical order, with the default first. */
export const COUNTRIES: Country[] = (() => {
  // NAMES is already in alphabetical order; sorting again at runtime could
  // order differently on the server and in the browser.
  const list = Object.entries(NAMES).map(([code, name]) => ({ code, name }));
  const i = list.findIndex((c) => c.code === DEFAULT_COUNTRY);
  if (i > 0) list.unshift(...list.splice(i, 1));
  return list;
})();

export function countryName(code: string): string {
  return NAMES[code] ?? code;
}

export function regionLabel(code: string): string {
  return { GH: "Region", CM: "Region", KE: "County", ZA: "Province", CA: "Province", GB: "Country" }[code] ?? "State";
}

export const REGIONS: Record<string, string[]> = {
  NG: [
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
    "Ebonyi", "Edo", "Ekiti", "Enugu", "Federal Capital Territory", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano",
    "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau",
    "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
  ],
  GH: [
    "Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East", "Northern", "Oti",
    "Savannah", "Upper East", "Upper West", "Volta", "Western", "Western North",
  ],
  CM: ["Adamawa", "Centre", "East", "Far North", "Littoral", "North", "North-West", "South", "South-West", "West"],
  KE: [
    "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado",
    "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu",
    "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa", "Murang'a", "Nairobi", "Nakuru",
    "Nandi", "Narok", "Nyamira", "Nyandarua", "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River",
    "Tharaka-Nithi", "Trans-Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
  ],
  ZA: ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"],
  GB: ["England", "Northern Ireland", "Scotland", "Wales"],
  CA: [
    "Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Northwest Territories",
    "Nova Scotia", "Nunavut", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon",
  ],
  US: [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "District of Columbia",
    "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
    "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
    "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma",
    "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
  ],
};
