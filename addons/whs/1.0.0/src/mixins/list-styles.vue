<script>
import API from "../api";

export default {
  computed: {
    itemStyle() {
      if (this.settings.location.image.indexOf("base64") === -1) {
        return {
          "background-image": `url(${API.file_base_url +
            this.settings.item.image})`
        };
      } else {
        return {
          "background-image": `url(${this.settings.item.image})`
        };
      }
    },
    locationStyle() {
      if (this.settings.location.image.indexOf("base64") === -1) {
        return {
          "background-image": `url(${API.file_base_url +
            this.settings.location.image})`
        };
      } else {
        return {
          "background-image": `url(${this.settings.location.image})`
        };
      }
    },
    tagStyle() {
      if (this.settings.location.image.indexOf("base64") === -1) {
        return {
          "background-image": `url(${API.file_base_url +
            this.settings.tag.image})`
        };
      } else {
        return {
          "background-image": `url(${this.settings.tag.image})`
        };
      }
    },
    activityStyle() {
      if (this.settings.location.image.indexOf("base64") === -1) {
        return {
          "background-image": `url(${API.file_base_url +
            this.settings.activity.image})`
        };
      } else {
        return {
          "background-image": `url(${this.settings.activity.image})`
        };
      }
    },
    roleStyle() {
      if (this.settings.location.image.indexOf("base64") === -1) {
        return {
          "background-image": `url(${API.file_base_url +
            this.settings.role.image})`
        };
      } else {
        return {
          "background-image": `url(${this.settings.role.image})`
        };
      }
    },
    teamStyle() {
      if (this.settings.location.image.indexOf("base64") === -1) {
        return {
          "background-image": `url(${API.file_base_url +
            this.settings.team.image})`
        };
      } else {
        return {
          "background-image": `url(${this.settings.team.image})`
        };
      }
    },
    dynamicStyle() {
      self = this;
      //switch (self.activities_more.target) {
      switch (self.dynamicStyleTarget) {
        case null:
          return {};
          break;
        case undefined:
          return {};
          break;
        case "item":
          return self.itemStyle;
          break;
        case "location":
          return self.locationStyle;
          break;
        case "tag":
          return self.tagStyle;
          break;
        case "role":
          return self.roleStyle;
          break;
        case "team":
          return self.teamStyle;
          break;
      }
    }
  },
  data(){
      return{
          dynamicStyleTarget: null
      }
  }
};
</script>
