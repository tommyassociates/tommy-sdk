<script>
export default {
  props: {
    value: {
      default: null
    },
    params: {
      name: {
        type: String
      },
      placeholder: {
        type: String
      },
      required: {
        type: Boolean,
        default: false
      },
      validate: {
        type: Boolean,
        default: false
      }
    }
  },
  methods: {
    updateValue(val) {
      const self = this;
      self.self_value = val;
      self.$emit("value:update", {
        alias: self.params.alias,
        value: val
      });
    }
  },
  data() {
    const self = this;
    return {
      self_value: self.value
    };
  }
}
</script>