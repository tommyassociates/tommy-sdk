export default {
  ////default settings
  main: {
    name: window.tommy.i18n.t("whs.index.title"),
    currency: "USD",
    date: "YYYY/MM/DD",
    time: "HH:mm"
  },
  item: {
    name: window.tommy.i18n.t("whs.common.item"),
    plural_name: window.tommy.i18n.t("whs.common.items"),
    header_color: "#ffffff",
    highlight_color: "#ff4500",
    font_color: "#333333",
    image: "assets/default/item.svg"
  },
  location: {
    name: window.tommy.i18n.t("whs.common.location"),
    plural_name: window.tommy.i18n.t("whs.common.locations"),
    header_color: "#ffffff",
    highlight_color: "#ff4500",
    font_color: "#333333",
    image: "assets/default/location.svg"
  },
  tag: {
    name: window.tommy.i18n.t("whs.common.tag"),
    plural_name: window.tommy.i18n.t("whs.common.tags"),
    header_color: "#ffffff",
    highlight_color: "#ff4500",
    font_color: "#333333",
    image: "assets/default/tag.svg"
  },
  activity: {
    name: window.tommy.i18n.t("whs.common.activity"),
    plural_name: window.tommy.i18n.t("whs.common.activities"),
    header_color: "#ffffff",
    highlight_color: "#ff4500",
    font_color: "#333333",
    image: "assets/icon-clock-black.svg"
  },
  role: {
    image: "assets/default/team.svg"
  },
  team: {
    image: "assets/default/team.svg"
  },
  item_fields: [    
    {
      name: "Photo",
      description: "Uploaded photo(s) of the item",
      alias: "image",
      type: "photo",
      active: true,
      order: 0
    },   
    {
      name: "Name",
      alias: "name",
      type: "single_line_text",
      description: "Product name field",
      placeholder: "Required...",
      required: true,
      validate: true,
      active: true,
      order: 1
    },
    {
      name: "SKU / Barcode",
      alias: "sku",
      type: "barcode",
      description: "Barcode item line",
      placeholder: "E.g. 1234567890...",
      active: true,
      order: 2
    },
    {
      name: "Price",
      alias: "price",
      type: "currency",
      description: "Price item",
      placeholder: "E.g. 123.456...",
      active: true,
      order: 3
    },
    {
      name: "Tag",
      alias: "tag",
      type: "tag",
      description: "Tag item",
      placeholder: "Search tags...",
      active: true,
      order: 4
    },
    {
      name: "Minimum Stock Level",
      alias: "min_stock_level",
      type: "integer",
      description: "Minimum Stock Level description",
      placeholder: "E.g. 123456...",
      active: true,
      order: 5
    },
    {
      name: "Quantity",
      alias: "quantity",
      type: "integer",
      description: "Quantity description",
      placeholder: "E.g. 123456...",
      active: true,
      order: 6
    },
    {
      name: "Description",
      alias: "description",
      type: "multi_line_text",
      description: "Short multi line description of the item",
      placeholder: "Optional",
      active: true,
      order: 7
    },
    {
      name: "Storage",
      alias: "storage_type",
      type: "single_select",
      description: "Storage type selection",
      placeholder: "Select (optional)",
      active: true,
      order: 1,
      options: [
        {
          name: "Unspecified",
          value: "unspecified"
        }, 
        {
          name: "Freezer",
          value: "freezer"
        },
        {
          name: "Ambient",
          value: "ambient"
        }
      ]
    },
  ]
};
