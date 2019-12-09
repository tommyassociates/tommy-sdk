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
      name: window.tommy.i18n.t("whs.fields.image.name"),
      description: window.tommy.i18n.t("whs.fields.image.description"),
      placeholder: window.tommy.i18n.t("whs.fields.image.placeholder"),
      alias: "image",
      type: "photo",
      active: true,
      order: 0
    },   
    {
      name: window.tommy.i18n.t("whs.fields.name.name"),
      description: window.tommy.i18n.t("whs.fields.name.description"),
      placeholder: window.tommy.i18n.t("whs.fields.name.placeholder"),
      alias: "name",
      type: "single_line_text",
      required: true,
      validate: true,
      active: true,
      order: 1
    },
    {
      name: window.tommy.i18n.t("whs.fields.sku.name"),
      description: window.tommy.i18n.t("whs.fields.sku.description"),
      placeholder: window.tommy.i18n.t("whs.fields.sku.placeholder"),
      alias: "sku",
      type: "barcode",
      active: true,
      order: 2
    },
    {
      name: window.tommy.i18n.t("whs.fields.price.name"),
      description: window.tommy.i18n.t("whs.fields.price.description"),
      placeholder: window.tommy.i18n.t("whs.fields.price.placeholder"),
      alias: "price",
      type: "currency",
      active: true,
      order: 3
    },
    {
      name: window.tommy.i18n.t("whs.fields.tag.name"),
      description: window.tommy.i18n.t("whs.fields.tag.description"),
      placeholder: window.tommy.i18n.t("whs.fields.tag.placeholder"),
      alias: "tag",
      type: "tag",
      active: true,
      order: 4
    },
    {
      name: window.tommy.i18n.t("whs.fields.min_stock_level.name"),
      description: window.tommy.i18n.t("whs.fields.min_stock_level.description"),
      placeholder: window.tommy.i18n.t("whs.fields.min_stock_level.placeholder"),
      alias: "min_stock_level",
      type: "integer",
      active: true,
      order: 5
    },
    {
      name: window.tommy.i18n.t("whs.fields.quantity.name"),
      description: window.tommy.i18n.t("whs.fields.quantity.description"),
      placeholder: window.tommy.i18n.t("whs.fields.quantity.placeholder"),
      alias: "quantity",
      type: "integer",
      active: true,
      order: 6
    },
    {
      name: window.tommy.i18n.t("whs.fields.description.name"),
      description: window.tommy.i18n.t("whs.fields.description.description"),
      placeholder: window.tommy.i18n.t("whs.fields.description.placeholder"),
      alias: "description",
      type: "multi_line_text",
      active: true,
      order: 7
    },
    {
      name: window.tommy.i18n.t("whs.fields.storage_type.name"),
      description: window.tommy.i18n.t("whs.fields.storage_type.description"),
      placeholder: window.tommy.i18n.t("whs.fields.storage_type.placeholder"),
      alias: "storage_type",
      type: "single_select",
      active: true,
      order: 8,
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
