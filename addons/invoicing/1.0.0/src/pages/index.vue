/* eslint-disable no-restricted-syntax */
<template>
  <f7-page id="invoicing__index" name="invoicing__index" class="invoicing-page">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
      <f7-nav-right v-if="!isNurse">
        <f7-link href="/invoicing/settings/" icon-f7="gear"></f7-link>
        <f7-link href="/invoicing/order-details/" icon-f7="add"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-swiper
      v-if="orderedLists && orderedLists.length"
      class="no-swipe-panel"
      :params="{
      slidesPerView: 'auto',
      breakpointsInverse: true,
      centeredSlides: false,
      touchMoveStopPropagation: false,
      on: {
        tap: onSlideClick
      },
      breakpoints: {
        768: {
          centeredSlides: true,
        }
      },
    }"
    >
      <f7-swiper-slide v-for="list in orderedLists" :key="list.id">
        <div class="orders-list" :data-id="list.id" :class="{'hasScroll': listWithScroll[list.id]}">
          <div class="orders-list-header">
            <div>{{list.name}}</div>
            <div class="order-list-header-right">
              <a :data-url="`/invoicing/list-edit/${list.id}/`" v-if="canEditList(list)">
                <img
                  :src="`${$addonAssetsUrl}slice6.png`"
                  :srcset="`${$addonAssetsUrl}slice6@2x.png 2x, ${$addonAssetsUrl}slice6@3x.png 3x`"
                />
              </a>
              <a
                @click="makeCSV(list.orders, list.name)"
                v-if="canEditList(list) && list.orders.length > 0"
                ref="download"
              >
                <img :src="`${$addonAssetsUrl}download.svg`" />
              </a>
            </div>
          </div>
          <div class="orders-list-content">
            <template v-if="list.orders && list.orders.length">
              <a
                v-for="(order, index) in list.orders"
                :key="index"
                :data-url="`/invoicing/order-details/${order.id}/`"
                class="card invoicing-order-card"
              >
                <div class="card-header">
                  <span
                    class="order-date"
                    v-if="order.data && order.data.date"
                  >{{orderDate(order.data ? order.data.date : null)}}</span>
                  <span
                    class="order-status"
                    v-if="!isNurse"
                  >{{$t(`invoicing.order_status.${order.status}`)}}</span>
                </div>
                <div class="card-content">
                  <f7-list class="no-hairlines no-hairlines-between">
                    <f7-list-item v-if="order.user_id" :title="orderUserName(order.user_id)">
                      <img :src="`${$addonAssetsUrl}icon-user.svg`" slot="media" />
                    </f7-list-item>
                    <f7-list-item :title="order.name">
                      <img :src="`${$addonAssetsUrl}icon-product.svg`" slot="media" />
                    </f7-list-item>
                    <f7-list-item v-if="order.total && !isNurse" :title="order.total">
                      <img :src="`${$addonAssetsUrl}icon-money.svg`" slot="media" />
                    </f7-list-item>
                    <f7-list-item
                      v-if="order.data && order.data.location"
                      :title="`${order.data.location.address} ${order.data.location.city}`"
                    >
                      <img :src="`${$addonAssetsUrl}icon-location.svg`" slot="media" />
                    </f7-list-item>
                  </f7-list>
                </div>
              </a>
            </template>
          </div>
        </div>
      </f7-swiper-slide>
    </f7-swiper>
  </f7-page>
</template>
<script>
import API from "../api";
import humanTime from "../utils/human-time";

export default {
  data() {
    const self = this;
    let account;
    const actorId = self.$f7route.query.actor_id;
    if (actorId) {
      account = self.$root.teamMembers.filter(
        user => user.user_id === parseInt(self.actorId, 10)
      )[0];
    } else {
      account = self.$root.account;
    }
    if (!account) {
      account = self.$root.account;
    }
    const roles = account.roles;
    API.isNurse =
      !roles ||
      (roles && roles.length === 0) ||
      (roles &&
        (roles.indexOf("Nurse") >= 0 || roles.indexOf("Employee") >= 0));
    API.assignee_id = API.isNurse ? account.user_id : null;
    return {
      lists: null,
      actorId,
      listWithScroll: {},
      isNurse: API.isNurse,
      contacts: API.contacts,
      orderContacts: {},
      orderContactsLoading: {},
      csvKeys: [],
      csvValues: [],
      promotions: null,
    };
  },
  created() {
    const self = this;
    if (self.actorId) {
      API.actorId = parseInt(self.actorId, 10);
      API.actor = self.actor;
      if (
        API.actor.roles &&
        (API.actor.roles.indexOf("Nurse") >= 0 ||
          API.actor.roles.indexOf("Employee") >= 0)
      ) {
        API.isNurse = true;
        self.isNurse = true;
        API.assignee_id = API.actor.user_id;
      }
    } else {
      delete API.actorId;
      delete API.actor;
    }
  },
  computed: {
    actor() {
      const self = this;
      if (!self.actorId) return null;
      return self.$root.teamMembers.filter(
        user => user.user_id === parseInt(self.actorId, 10)
      )[0];
    },
    pageTitle() {
      const self = this;
      if (!self.actorId) return self.$t("invoicing.index.title", "Orders");
      const actorName = self.$root.teamMembers.filter(
        user => user.user_id === parseInt(self.actorId, 10)
      )[0].first_name;
      return self.$t("invoicing.index.title_user", { user: actorName });
    },
    orderedLists() {
      const self = this;
      if (!self.lists) return null;
      return self.lists
        .sort((a, b) => {
          return a.data.position - b.data.position;
        })
        .filter(list => list.data.active);
    }
  },
  methods: {
    makeCSV(orders, name) {
      var head = [
        'id', 'user_id','couponName','couponDiscount',
        'Create Time','Booking Time',
        'city','Address',
        'pending','paid','processing','QA','complete',
        'Jan','Feb','Mar', 'Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'
      ];
      var lines = [];

      var statusCount = { //订单状态
        QA: 0,
        complete: 0,
        paid: 0,
        pending: 0,
        processing: 0,
      }
      var monthSumCount = [0,0,0,0,0,0,0,0,0,0,0,0]; //12个月
      for(var i = 0; i < orders.length; i++) {
        var line = [];
        var order = orders[i];

        line.push(order.id);//1
        line.push(order.user_id);//2

        let couponName = null;
        if(order.nurse){
          couponName = order.data.nurse.first_name + order.data.nurse.last_name; //护工名字
        }

        line.push(couponName);//3

        let couponDiscount = this.promotionDiscount(order.vendor_coupon_id);//优惠券数
        line.push(couponDiscount);//4

        line.push(this.orderUserName(order.user_id).toLocaleString());//5
        line.push(this.orderUserName(+order.data.date).toLocaleString());//6

        line.push('"' + order.data.location.city + '"');//7
        line.push('"' + order.data.location.address + '"');//8

        statusCount[order.status]++;
        line.push(statusCount.pending);
        line.push(statusCount.paid);
        line.push(statusCount.processing);
        line.push(statusCount.QA);
        line.push(statusCount.complete);

        var month = new Date(order.created_at).getMonth();
        monthSumCount[month]++;
        line.push(...monthSumCount);
        
        lines.push(line);
      }    
      var csvText =  head.join(',') + '\n'+
      lines.map(line => line.join(',')).join('\n');

      this.triggerDownload(name, csvText)
    },
    triggerDownload(name, text) {
      const BOM = "\uFEFF";
      const fileName = `${name}.csv`;debugger;
      const downloadLink = document.createElement("a");
      downloadLink.href = `data:attachment/csv;charset=utf-8,${BOM}${encodeURIComponent(
        text
      )}`;
      downloadLink.target = "_blank";
      downloadLink.download = fileName;
      downloadLink.click();
    }, 
    //old 
    downloadCSV(orders, name) {
      //orders：所有订单状态，为一个数组，每项是一个订单数据
      //this.csvKeys: 为一个数组，表头  
      //this.csvValues: 为一个数组，所有订单信息
      //text: 拼接的表格全部内容 this.csvKeys + this.csvValues以字符串形式拼接
      orders.forEach((order, index) => {
        this.traversalObject(order, index, true); //遍历orders对象
        this.csvValues[this.csvValues.length - 1] += "\n";
      });
      const text = `${this.csvKeys.join(",")}\n${this.csvValues
        .join(",")
        .replace(/\n,/g, "\n")}`;
      const BOM = "\uFEFF";
      const fileName = `${name}.csv`; 
      const downloadLink = document.createElement("a");
      downloadLink.href = `data:attachment/csv;charset=utf-8,${BOM}${encodeURIComponent(
        text
      )}`;
      downloadLink.target = "_blank";
      downloadLink.download = fileName;
      downloadLink.click();
    },
    traversalObject(order, index, isFirst = false) {
      // eslint-disable-next-line no-restricted-syntax
      for (const i in order) {
        if (typeof order[i] === "object" && order[i] !== null) {
          this.traversalObject(order[i], index); // 递归遍历
        } else if (i === "id" || i === "user_id") {
          if (index === 0 && isFirst) {
            this.csvKeys.push(i);
          }
          if (isFirst) {
            if (i === "user_id") {
              order[i] = this.orderUserName(order[i]);
            }
            this.csvValues.push(order[i]);
          }
        } else if (i === "date") {
          if (index === 0) {
            this.csvKeys.push(i);
          }
          this.csvValues.push(this.orderDate(order[i]));
        } else if (i === "assignee_id") {
          // 护工名字
          if (index === 0) {
            this.csvKeys.push(i);
          }
          const name = order[i] ? this.getAssigneeName(order[i]) : "null";
          this.csvValues.push(name);
        } else if (i === "vendor_coupon_id") {
          if (index === 0) {
            this.csvKeys.push("couponName", "couponDiscount");
          }
          const name = order[i] ? this.promotionName(order[i]) : "null";
          const disCount = order[i] ? this.promotionDiscount(order[i]) : "null";
          this.csvValues.push(name, disCount);
        } else if (
          i === "status" ||
          i === "city" ||
          i === "created_at" ||
          i === "total" ||
          i === "address"
        ) {
          if (index === 0) {
            this.csvKeys.push(i);
          }
          if (typeof order[i] === "string") {
            order[i] = order[i].split(",").join(" ");
          }
          this.csvValues.push(order[i] ? order[i] : "null");
        }
      }
    },
    getAssigneeName(id) {
      const name = this.$root.teamMembers.filter(
        m => m.user_id === parseInt(id, 10)
      )[0];
      return name.last_name + name.first_name;
    },
    onSlideClick(e) {
      const self = this;
      const url = self
        .$$(e.target)
        .closest("a")
        .eq(0)
        .attr("data-url");
      if (!url) return;
      self.$f7router.navigate(url);
    },
    humanTime,
    orderDate(date) {
      const self = this;
      if (!date) return "";
      return self.$moment(parseInt(date, 10)).format("YYYY/MM/DD HH:mm");
    },
    orderUserName(user_id) {
      const self = this;
      let user;
      if (self.isNurse) {
        user = self.orderContacts[user_id];
      }
      if (!user) {
        user = self.$root.teamMembers.filter(
          m => m.user_id === parseInt(user_id, 10)
        )[0];
      }
      if (!user && self.contacts && self.contacts.length) {
        user = self.contacts.filter(
          c => c.friend_id === parseInt(user_id, 10)
        )[0];
      }
      if (!user) return "";
      return user.name || `${user.first_name || ""} ${user.last_name || ""}`;
    },
    listHasScroll(list) {
      const self = this;
      if (!list.orders || list.orders.length === 0) return false;
      const listContentEl = self.$$(
        `.orders-list[data-id="${list.id}"] .orders-list-content`
      )[0];
      if (!listContentEl) return false;
      return listContentEl.scrollHeight > listContentEl.offsetHeight;
    },
    loadListOrders(list) {
      const self = this;
      API.loadListOrders(list).then(orders => {
        list.orders = orders;
        orders.forEach(order => {
          if (!self.isNurse) return;
          if (
            !self.orderContacts[order.user_id] &&
            !self.orderContactsLoading[order.user_id]
          ) {
            self.orderContacts[order.user_id] = {};
            self.orderContactsLoading[order.user_id] = true;
            self.$api.getContact(order.user_id).then(contact => {
              self.orderContacts[order.user_id] = contact;
              self.orderContactsLoading[order.user_id] = false;
              self.$forceUpdate();
            });
          }
        });
        self.$nextTick(() => {
          if (self.listHasScroll(list)) {
            self.$set(self.listWithScroll, list.id, true);
          } else {
            self.$set(self.listWithScroll, list.id, false);
          }
        });
      });
    },
    reloadListsOrders() {
      const self = this;
      if (!self.lists) return;
      self.lists.forEach(list => {
        self.loadListOrders(list);
      });
    },
    loadLists(ignoreCache, createDefault = true) {
      const self = this;
      API.loadLists({}, { cache: !ignoreCache }).then(lists => {
        lists.forEach(list => {
          list.orders = [];
        });
        self.lists = lists;
        if (!self.lists.length && createDefault) {
          API.createDefaultList(self.$root.user)
            .then(() => {
              self.loadLists(true, false);
            })
            .catch(() => {
              self.loadLists(true, false);
            });
        } else {
          self.lists.forEach(list => {
            if (!list.data.active) return;
            self.loadListOrders(list);
          });
        }
      });
    },
    reloadLists() {
      const self = this;
      self.loadLists(true);
    },
    canEditList(list) {
      const self = this;
      if (self.isNurse && !self.actorId) return false;
      const account = self.$root.account;
      const isOwnerOrManager =
        account.type === "Team" ||
        account.type === "TeamMember" ||
        account.roles.indexOf("Team Manager") >= 0;
      const isManager = account.roles.indexOf("Team Manager") >= 0;
      if (list.data.default && isManager) return true;
      if (list.data.default && !isOwnerOrManager) return false;
      if (list.permission_to.indexOf("update") !== -1) return true;
      return false;
    },
    promotionName(id) {
      const self = this;
      return self.promotions.filter(el => el.id === parseInt(id, 10))[0].name;
    },
    promotionDiscount(id) {
      const self = this;
      const promo = self.promotions.filter(el => el.id === parseInt(id, 10))[0];
      if (!promo) return 0;
      if (promo.kind !== "percentage") return promo.amount;
      return self.orderItemsTotal * promo.amount;
    }
  },
  beforeDestroy() {
    const self = this;
    self.$events.$off("invoicing:reloadListsOrders", self.reloadListsOrders);
    self.$events.$off("invoicing:reloadLists", self.reloadLists);
  },
  mounted() {
    const self = this;
    self.loadLists();
    if (!API.contacts) {
      self.$api.getContacts().then(c => {
        self.contacts = c;
        API.contacts = c;
      });
    }
    self.$events.$on("invoicing:reloadListsOrders", self.reloadListsOrders);
    self.$events.$on("invoicing:reloadLists", self.reloadLists);

    API.loadPromotions().then(promotions => {
      self.promotions = promotions;
    });
  }
};
</script>