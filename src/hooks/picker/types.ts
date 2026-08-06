export type OrderItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  images?: string[] | null;
};

/**
 * A single flaggable line on the Picker screen. For a plain product this is the
 * order_item itself. For a set/bundle it is ONE component of the set, so a picker
 * can flag just the part that's short instead of the whole set.
 */
export type PickRow = {
  key: string;            // unique key for the out-of-stock maps
  orderItemId: string;    // parent order_item this row belongs to
  productId: string;      // product to flag + procure (the set, or a component)
  productName: string;
  quantity: number;       // units needed (component: recipe qty x set qty)
  isComponent: boolean;
  setName?: string;       // parent set name, for component rows only
};

/** A display group in the Picker table: a plain item, or a set with its parts. */
export type PickGroup = {
  orderItemId: string;
  productName: string;
  quantity: number;
  images?: string[] | null;
  isSet: boolean;
  rows: PickRow[];
};
