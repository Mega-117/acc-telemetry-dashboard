// Car images
const mustangImg = '/images/cars/mustang_gt3.png'
const astonMartinImg = '/images/cars/aston_martin_gt3.png'
const ferrariImg = '/images/cars/ferrari_296_gt3.png'
const ferrari488Img = '/images/cars/ferrari_488_gt3.png'
const bmwImg = '/images/cars/bmw_m4_gt3.png'
const mclarenImg = '/images/cars/mclaren_720s_gt3.png'
const audiImg = '/images/cars/audi_r8_gt3.png'
const bentleyImg = '/images/cars/bentley_continental_gt3.png'
const hondaImg = '/images/cars/honda_nsx_gt3.png'
const lamborghiniImg = '/images/cars/lamborghini_huracan_gt3.png'
const mercedesImg = '/images/cars/mercedes_amg_gt3.png'
const porscheImg = '/images/cars/porsche_911_gt3.png'
const nissanImg = '/images/cars/nissan_gtr_gt3.png'
const lexusImg = '/images/cars/lexus_rcf_gt3.png'
const jaguarImg = '/images/cars/jaguar_gt3.png'
const defaultCarImg = '/images/cars/default_gt3.png'

// Car image mapping (key patterns from session data)
const carImages: Record<string, string> = {
  mustang: mustangImg,
  ford_mustang: mustangImg,
  amr: astonMartinImg,
  aston: astonMartinImg,
  aston_martin: astonMartinImg,
  v8_vantage: astonMartinImg,
  v12_vantage: astonMartinImg,
  ferrari_296: ferrariImg,
  '296_gt3': ferrariImg,
  ferrari_488: ferrari488Img,
  '488_gt3': ferrari488Img,
  '488': ferrari488Img,
  bmw: bmwImg,
  m4: bmwImg,
  m4_gt3: bmwImg,
  m6: bmwImg,
  m6_gt3: bmwImg,
  mclaren: mclarenImg,
  '720s': mclarenImg,
  '650s': mclarenImg,
  audi: audiImg,
  r8: audiImg,
  r8_lms: audiImg,
  bentley: bentleyImg,
  continental: bentleyImg,
  honda: hondaImg,
  nsx: hondaImg,
  lamborghini: lamborghiniImg,
  huracan: lamborghiniImg,
  'huracán': lamborghiniImg,
  mercedes: mercedesImg,
  amg: mercedesImg,
  amg_gt: mercedesImg,
  porsche: porscheImg,
  '911': porscheImg,
  '991': porscheImg,
  '992': porscheImg,
  nissan: nissanImg,
  gtr: nissanImg,
  'gt-r': nissanImg,
  nismo: nissanImg,
  lexus: lexusImg,
  rcf: lexusImg,
  rc_f: lexusImg,
  jaguar: jaguarImg,
  emil_frey: jaguarImg,
}

export function getOverviewCarImage(rawName?: string | null): string {
  const carName = (rawName || '').toLowerCase()
  for (const [key, image] of Object.entries(carImages)) {
    if (carName.includes(key)) return image
  }
  return defaultCarImg
}
