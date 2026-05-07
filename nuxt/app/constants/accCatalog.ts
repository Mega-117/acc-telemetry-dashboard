import { TRACK_METADATA } from '~/services/projections/trackMetadata'

export interface AccCarOption {
  id: string
  name: string
  category: 'GT3' | 'GT4' | 'GT2' | 'Cup' | 'TCX' | 'ST'
}

const EXTRA_ACC_TRACK_OPTIONS = [
  { id: 'nurburgring_24h', name: 'Nurburgring 24H' },
  { id: 'nordschleife', name: 'Nordschleife' }
]

export const ACC_TRACK_OPTIONS = [
  ...Object.values(TRACK_METADATA).map((track) => ({
    id: track.id,
    name: track.name
  })),
  ...EXTRA_ACC_TRACK_OPTIONS
]
  .filter((track, index, tracks) => tracks.findIndex((item) => item.name === track.name) === index)
  .sort((a, b) => a.name.localeCompare(b.name))

export const ACC_CAR_OPTIONS: AccCarOption[] = [
  { id: 'alpine_a110_gt4', name: 'Alpine A110 GT4', category: 'GT4' },
  { id: 'amr_v12_vantage_gt3', name: 'Aston Martin V12 Vantage GT3', category: 'GT3' },
  { id: 'amr_v8_vantage_gt3', name: 'Aston Martin V8 Vantage GT3', category: 'GT3' },
  { id: 'amr_v8_vantage_gt4', name: 'Aston Martin V8 Vantage GT4', category: 'GT4' },
  { id: 'audi_r8_gt2', name: 'Audi R8 LMS GT2', category: 'GT2' },
  { id: 'audi_r8_lms_evo_gt3', name: 'Audi R8 LMS Evo GT3', category: 'GT3' },
  { id: 'audi_r8_lms_evo_ii_gt3', name: 'Audi R8 LMS Evo II GT3', category: 'GT3' },
  { id: 'audi_r8_lms_gt3', name: 'Audi R8 LMS GT3', category: 'GT3' },
  { id: 'audi_r8_lms_gt4', name: 'Audi R8 LMS GT4', category: 'GT4' },
  { id: 'bentley_continental_2015_gt3', name: 'Bentley Continental GT3 2015', category: 'GT3' },
  { id: 'bentley_continental_2018_gt3', name: 'Bentley Continental GT3 2018', category: 'GT3' },
  { id: 'bmw_m2_cs_racing', name: 'BMW M2 CS Racing', category: 'TCX' },
  { id: 'bmw_m4_gt3', name: 'BMW M4 GT3', category: 'GT3' },
  { id: 'bmw_m4_gt4', name: 'BMW M4 GT4', category: 'GT4' },
  { id: 'bmw_m6_gt3', name: 'BMW M6 GT3', category: 'GT3' },
  { id: 'chevrolet_camaro_gt4', name: 'Chevrolet Camaro GT4.R', category: 'GT4' },
  { id: 'ferrari_296_gt3', name: 'Ferrari 296 GT3', category: 'GT3' },
  { id: 'ferrari_488_challenge_evo', name: 'Ferrari 488 Challenge Evo', category: 'Cup' },
  { id: 'ferrari_488_gt3', name: 'Ferrari 488 GT3', category: 'GT3' },
  { id: 'ferrari_488_gt3_evo', name: 'Ferrari 488 GT3 Evo', category: 'GT3' },
  { id: 'ford_mustang_gt3', name: 'Ford Mustang GT3', category: 'GT3' },
  { id: 'ginetta_g55_gt4', name: 'Ginetta G55 GT4', category: 'GT4' },
  { id: 'honda_nsx_gt3', name: 'Honda NSX GT3', category: 'GT3' },
  { id: 'honda_nsx_gt3_evo', name: 'Honda NSX GT3 Evo', category: 'GT3' },
  { id: 'jaguar_g3', name: 'Jaguar G3', category: 'GT3' },
  { id: 'ktm_xbow_gt2', name: 'KTM X-Bow GT2', category: 'GT2' },
  { id: 'ktm_xbow_gt4', name: 'KTM X-Bow GT4', category: 'GT4' },
  { id: 'lamborghini_huracan_gt3', name: 'Lamborghini Huracan GT3', category: 'GT3' },
  { id: 'lamborghini_huracan_gt3_evo', name: 'Lamborghini Huracan GT3 Evo', category: 'GT3' },
  { id: 'lamborghini_huracan_gt3_evo2', name: 'Lamborghini Huracan GT3 Evo2', category: 'GT3' },
  { id: 'lamborghini_huracan_st', name: 'Lamborghini Huracan Super Trofeo', category: 'ST' },
  { id: 'lamborghini_huracan_st_evo2', name: 'Lamborghini Huracan Super Trofeo Evo2', category: 'ST' },
  { id: 'lexus_rc_f_gt3', name: 'Lexus RC F GT3', category: 'GT3' },
  { id: 'maserati_gran_turismo_mc_gt4', name: 'Maserati GranTurismo MC GT4', category: 'GT4' },
  { id: 'maserati_mc20_gt2', name: 'Maserati MC20 GT2', category: 'GT2' },
  { id: 'mclaren_570s_gt4', name: 'McLaren 570S GT4', category: 'GT4' },
  { id: 'mclaren_650s_gt3', name: 'McLaren 650S GT3', category: 'GT3' },
  { id: 'mclaren_720s_gt3', name: 'McLaren 720S GT3', category: 'GT3' },
  { id: 'mclaren_720s_gt3_evo', name: 'McLaren 720S GT3 Evo', category: 'GT3' },
  { id: 'mercedes_amg_gt2', name: 'Mercedes-AMG GT2', category: 'GT2' },
  { id: 'mercedes_amg_gt3', name: 'Mercedes-AMG GT3', category: 'GT3' },
  { id: 'mercedes_amg_gt3_evo', name: 'Mercedes-AMG GT3 Evo', category: 'GT3' },
  { id: 'mercedes_amg_gt4', name: 'Mercedes-AMG GT4', category: 'GT4' },
  { id: 'nissan_gt_r_nismo_gt3_2015', name: 'Nissan GT-R Nismo GT3 2015', category: 'GT3' },
  { id: 'nissan_gt_r_nismo_gt3_2018', name: 'Nissan GT-R Nismo GT3 2018', category: 'GT3' },
  { id: 'porsche_718_cayman_gt4', name: 'Porsche 718 Cayman GT4 Clubsport', category: 'GT4' },
  { id: 'porsche_911_gt2_rs_clubsport', name: 'Porsche 911 GT2 RS Clubsport Evo', category: 'GT2' },
  { id: 'porsche_911_gt3_cup_2017', name: 'Porsche 911 GT3 Cup 2017', category: 'Cup' },
  { id: 'porsche_911_gt3_cup_2021', name: 'Porsche 911 GT3 Cup 2021', category: 'Cup' },
  { id: 'porsche_991_gt3_r', name: 'Porsche 991 GT3 R', category: 'GT3' },
  { id: 'porsche_991_ii_gt3_r', name: 'Porsche 991 II GT3 R', category: 'GT3' },
  { id: 'porsche_992_gt3_r', name: 'Porsche 992 GT3 R', category: 'GT3' },
  { id: 'porsche_935', name: 'Porsche 935', category: 'GT2' },
  { id: 'reiter_ktm_xbow_gt4', name: 'Reiter Engineering KTM X-Bow GT4', category: 'GT4' }
]
