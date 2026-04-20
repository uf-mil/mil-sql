import { deliveryTruckSvg } from '../components/SVGs/delivery_truck';
import { lostItemsSvg } from '../components/SVGs/lost_items';

/** Map location `name` (DB / JSON title) to raw SVG markup for map rendering. */
export const LOCATION_SVG_MARKUP_BY_NAME = {
  'To Be Delivered': deliveryTruckSvg,
  'Lost Items': lostItemsSvg
};
