// Car images
import mustangImg from '@/assets/images/cars/mustang_gt3.png'
import astonMartinImg from '@/assets/images/cars/aston_martin_gt3.png'
import ferrariImg from '@/assets/images/cars/ferrari_296_gt3.png'
import ferrari488Img from '@/assets/images/cars/ferrari_488_gt3.png'
import bmwImg from '@/assets/images/cars/bmw_m4_gt3.png'
import mclarenImg from '@/assets/images/cars/mclaren_720s_gt3.png'
import audiImg from '@/assets/images/cars/audi_r8_gt3.png'
import bentleyImg from '@/assets/images/cars/bentley_continental_gt3.png'
import hondaImg from '@/assets/images/cars/honda_nsx_gt3.png'
import lamborghiniImg from '@/assets/images/cars/lamborghini_huracan_gt3.png'
import mercedesImg from '@/assets/images/cars/mercedes_amg_gt3.png'
import porscheImg from '@/assets/images/cars/porsche_911_gt3.png'
import nissanImg from '@/assets/images/cars/nissan_gtr_gt3.png'
import lexusImg from '@/assets/images/cars/lexus_rcf_gt3.png'
import jaguarImg from '@/assets/images/cars/jaguar_gt3.png'
import defaultCarImg from '@/assets/images/cars/default_gt3.png'

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
