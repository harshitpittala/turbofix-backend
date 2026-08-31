/**
 * brands.js — Device brand → model list, mirrored from the public booking wizard
 * (turbofix/app/book-repair/components/BookingWizard.tsx) so the CRM offers the
 * same catalogue when staff add an order manually.
 */

const BRAND_MODELS = {
  "Apple": [
    "iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16 Plus", "iPhone 16",
    "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15 Plus", "iPhone 15",
    "iPhone 14 Pro Max", "iPhone 14 Pro", "iPhone 14 Plus", "iPhone 14",
    "iPhone 13 Pro Max", "iPhone 13 Pro", "iPhone 13 Mini", "iPhone 13",
    "iPhone 12 Pro Max", "iPhone 12 Pro", "iPhone 12 Mini", "iPhone 12",
    "iPhone 11 Pro Max", "iPhone 11 Pro", "iPhone 11",
    "iPhone XS Max", "iPhone XS", "iPhone XR", "iPhone X",
    "iPhone SE (3rd Gen)", "iPhone SE (2nd Gen)",
  ],
  "Samsung": [
    "Galaxy S25 Ultra", "Galaxy S25+", "Galaxy S25",
    "Galaxy S24 Ultra", "Galaxy S24+", "Galaxy S24",
    "Galaxy S23 Ultra", "Galaxy S23+", "Galaxy S23",
    "Galaxy S22 Ultra", "Galaxy S22+", "Galaxy S22",
    "Galaxy Z Fold 6", "Galaxy Z Fold 5", "Galaxy Z Fold 4",
    "Galaxy Z Flip 6", "Galaxy Z Flip 5", "Galaxy Z Flip 4",
    "Galaxy A55 5G", "Galaxy A35 5G", "Galaxy A25 5G", "Galaxy A15",
    "Galaxy M55", "Galaxy M54", "Galaxy M34",
    "Galaxy F55", "Galaxy F35", "Galaxy F15",
  ],
  "OnePlus": [
    "OnePlus 13", "OnePlus 13R", "OnePlus 12", "OnePlus 12R",
    "OnePlus 11", "OnePlus 11R", "OnePlus 10 Pro", "OnePlus 10T",
    "OnePlus Nord 4", "OnePlus Nord 3", "OnePlus Nord CE 4",
    "OnePlus Nord CE 3 Lite", "OnePlus Nord CE 3",
    "OnePlus Open", "OnePlus Ace 3 Pro",
  ],
  "Xiaomi": [
    "Xiaomi 15 Ultra", "Xiaomi 15 Pro", "Xiaomi 15",
    "Xiaomi 14 Ultra", "Xiaomi 14 Pro", "Xiaomi 14",
    "Redmi Note 14 Pro+", "Redmi Note 14 Pro", "Redmi Note 14",
    "Redmi Note 13 Pro+", "Redmi Note 13 Pro", "Redmi Note 13",
    "POCO X7 Pro", "POCO X7", "POCO X6 Pro", "POCO F6 Pro", "POCO F6",
    "Redmi 14C", "Redmi 13C", "Redmi 13",
  ],
  "Vivo": [
    "Vivo X200 Pro", "Vivo X200", "Vivo X100 Pro", "Vivo X100",
    "Vivo V40 Pro", "Vivo V40", "Vivo V30 Pro", "Vivo V30",
    "Vivo V29 Pro", "Vivo V29", "Vivo V29e",
    "Vivo T3 Pro", "Vivo T3x", "Vivo T3 5G",
    "Vivo Y300 Pro", "Vivo Y200 Pro", "Vivo Y200e", "Vivo Y100",
    "Vivo iQOO 13", "Vivo iQOO 12", "Vivo iQOO Neo 9 Pro",
  ],
  "OPPO": [
    "OPPO Find X8 Pro", "OPPO Find X8", "OPPO Find X7 Pro",
    "OPPO Reno 13 Pro", "OPPO Reno 13", "OPPO Reno 12 Pro", "OPPO Reno 12",
    "OPPO Reno 11 Pro", "OPPO Reno 11",
    "OPPO F27 Pro+", "OPPO F27 Pro", "OPPO F25 Pro",
    "OPPO A3 Pro", "OPPO A3", "OPPO A79", "OPPO A60",
    "OPPO K13", "OPPO K12",
  ],
  "Realme": [
    "Realme GT 7 Pro", "Realme GT 6T", "Realme GT 6",
    "Realme GT Neo 6", "Realme GT Neo 5",
    "Realme 14 Pro+", "Realme 14 Pro", "Realme 14",
    "Realme 13 Pro+", "Realme 13 Pro", "Realme 13",
    "Realme 12 Pro+", "Realme 12 Pro", "Realme 12",
    "Realme C67", "Realme C55", "Realme C53", "Realme C35",
    "Realme Narzo 70 Pro", "Realme Narzo 70",
  ],
  "Motorola": [
    "Motorola Edge 50 Ultra", "Motorola Edge 50 Pro", "Motorola Edge 50 Fusion",
    "Motorola Edge 40 Pro", "Motorola Edge 40 Neo", "Motorola Edge 40",
    "Motorola Edge 30 Ultra", "Motorola Edge 30 Pro",
    "Motorola Moto G85", "Motorola Moto G75", "Motorola Moto G64",
    "Motorola Moto G54", "Motorola Moto G34",
    "Motorola Razr 50 Ultra", "Motorola Razr 50",
  ],
  "Google": [
    "Pixel 9 Pro Fold", "Pixel 9 Pro XL", "Pixel 9 Pro", "Pixel 9",
    "Pixel 8 Pro", "Pixel 8a", "Pixel 8",
    "Pixel 7 Pro", "Pixel 7a", "Pixel 7",
    "Pixel 6 Pro", "Pixel 6a", "Pixel 6",
    "Pixel Fold",
  ],
  "Nothing": [
    "Nothing Phone (1)", "Nothing Phone (2)", "Nothing Phone (2a)",
    "Nothing Phone (2a Plus)", "Nothing Phone (3)",
    "Nothing Phone (3a)", "Nothing Phone (3a Pro)",
    "CMF Phone 1", "CMF Phone 2",
  ],
  "ASUS": [
    "ROG Phone 8", "ROG Phone 7", "ROG Phone 6", "ROG Phone 5",
    "Zenfone 10", "Zenfone 9", "Zenfone 8",
  ],
  "Sony": [
    "Xperia 1 VI", "Xperia 1 V",
    "Xperia 5 V", "Xperia 10 VI",
  ],
  "Nokia": [
    "Nokia XR21", "Nokia X30", "Nokia G60", "Nokia G42", "Nokia C32",
  ],
  "Huawei": [
    "Pura 70", "Mate 60 Pro", "Mate 50 Pro",
    "P60 Pro", "P50 Pro",
  ],
  "Honor": [
    "Magic 6 Pro", "Magic 5 Pro",
    "Honor 200 Pro", "Honor 200", "Honor 90",
  ],
  "iQOO": [
    "iQOO 13", "iQOO 12",
    "iQOO Neo 10", "iQOO Neo 9",
    "iQOO Z9 Turbo", "iQOO Z9", "iQOO Z7",
  ],
  "POCO": [
    "POCO F6 Pro", "POCO F6", "POCO F5",
    "POCO X6 Pro", "POCO X6",
    "POCO M6", "POCO C65",
  ],
  "Infinix": [
    "GT 20 Pro", "Note 50", "Note 40 Pro",
    "Zero 30", "Smart 8",
  ],
  "Tecno": [
    "Phantom V Fold", "Camon 40", "Camon 30",
    "Pova 6", "Spark 20",
  ],
  "Lava": [
    "Storm 5G", "Agni 3", "Agni 2",
    "Blaze 3", "Blaze 2",
  ],
  "itel": [
    "Vision 5", "A80", "A70", "P55", "S24",
  ],
};
