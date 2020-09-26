<template>
  <f7-page id="dashboard__index">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('dashboard.index.title')}}</f7-nav-title>
      <f7-nav-right></f7-nav-right>
    </f7-navbar>

    <f7-page-content>

      <f7-row no-gap>
        <f7-col width="100" tablet-width="50">
          <f7-block strong inset>
            <f7-block-header>{{$t('dashboard.index.subscription.title')}}</f7-block-header>
            <tommy-plus></tommy-plus>
            <free-trial :billing-info="billingInfo"></free-trial>
            <!-- <free-trial v-if="!hasCreditCard" :billing-info="billingInfo"></free-trial> -->
          </f7-block>
        </f7-col>
      </f7-row>

      <f7-row no-gap valign="flex-start">
        <f7-col width="100">
          <f7-block strong inset>
            <f7-block-header>{{$t('dashboard.index.team_members.title')}}</f7-block-header>

            <f7-row no-gap>
              <f7-col width="100" tablet-width="50">

                <f7-row class="team-members__row" @click="redirectToTeam('pending')">
                  <f7-col width="40">
                    {{$t('dashboard.index.team_members.pending_invites')}}
                  </f7-col>
                  <f7-col width="60">
                    {{pendingCount}} {{$t('dashboard.index.team_members.people')}}
                  </f7-col>
                </f7-row>
                <f7-row class="team-members__row" @click="redirectToTeam('active')">
                  <f7-col width="40">
                    {{$t('dashboard.index.team_members.active')}}
                  </f7-col>
                  <f7-col width="60">
                    {{activeCount}} {{$t('dashboard.index.team_members.people')}}
                  </f7-col>
                </f7-row>
                <f7-row class="team-members__row" @click="redirectToTeam('inactive')">
                  <f7-col width="40">
                    {{$t('dashboard.index.team_members.inactive')}}
                  </f7-col>
                  <f7-col width="60">
                    {{inactiveCount}} {{$t('dashboard.index.team_members.people')}}
                  </f7-col>
                </f7-row>
                <f7-row class="team-members__row" @click="redirectToTeam('archived')">
                  <f7-col width="40">
                    {{$t('dashboard.index.team_members.archived')}}
                  </f7-col>
                  <f7-col width="60">
                    {{archivedCount}} {{$t('dashboard.index.team_members.people')}}
                  </f7-col>
                </f7-row>

              </f7-col>
              <f7-col width="100" tablet-width="50">
                <div v-if="loaded">
                  <f7-row style="align-items:center">
                    <f7-col>
                      <div style="max-width: 300px;">
                        <pie-chart :data="chartData" :options="chartOptions"></pie-chart>
                      </div>
                    </f7-col>
                    <f7-col>
                      <div class="chart-legend">
                        <f7-row v-for="(item, index) in chartLegend"
                                :key="'chart-legend-'+index">
                          <f7-col><span :style="`background-color: ${item.color}`"></span></f7-col>
                          <f7-col>{{item.label}}</f7-col>
                        </f7-row>
                      </div>
                    </f7-col>
                  </f7-row>
                </div>
              </f7-col>
            </f7-row>
          </f7-block>
        </f7-col>
      </f7-row>


    </f7-page-content>
  </f7-page>
</template>
<script>
  import API from '../api';
  import PieChart from "../components/PieChart.js";
  import FreeTrial from '../components/free-trial';
  import TommyPlus from '../components/tommy-plus';

  export default {
    components: {
      PieChart,
      FreeTrial,
      TommyPlus,
    },
    data() {
      return {
        loaded: false,
        billingInfo: {},
        // teamMembers: {
        //   pending: 10,
        //   active: 200,
        //   inactive: 50,
        //   archived: 45,
        // },
        chartData: null,
        chartOptions: {
          borderWidth: "10px",
          hoverBackgroundColor: "red",
          hoverBorderWidth: "10px",
          legend: {
            display: false,
          },
          animations: {
            duration: 2000,
          },
          layout: {
            padding: 0,
          }
        },
        chartLegend: [
          {
            color: '#2EC8A1',
            label: 'Active',
          },
          {
            color: '#F5A623',
            label: 'Inactive',
          }
        ]
      };
    },
    computed: {
      pendingCount() {
        return this.$root.teamMembers.filter(x => x.status === 'pending').length
      },
      activeCount() {
        return this.$root.teamMembers.filter(x => x.status === 'active').length
      },
      inactiveCount() {
        return this.$root.teamMembers.filter(x => x.status === 'inactive').length
      },
      archivedCount() {
        return this.$root.teamMembers.filter(x => x.status === 'archived').length
      },
      hasCreditCard() {
        return this.billingInfo.customer_ref
      },
    },
    methods: {
      redirectToTeam(filter) {
        this.$f7router.navigate(`'/team?filter=${filter}`);
      },
      loadBillingInfo() {
        API.getBillingInfo({with_subscriptions: true}).then(billingInfo => {
          // const newBillingInfo = {...this.billingInfo, ...billingInfo};
          this.billingInfo = billingInfo;
          // this.subscriptions = billingInfo.subscriptions;
          this.loaded = true;
        });
      },
    },
    mounted() {
      // console.log(this.$root.teamMembers)
      this.loadBillingInfo()

      const total = +this.activeCount + +this.inactiveCount;
      const activePercentage = (+this.activeCount * 100) / total;
      const inactivePercentage = (+this.inactiveCount * 100) / total;
      const backgroundColor = this.chartLegend.map(colour => colour.color);

      this.chartData = {
        hoverBackgroundColor: "red",
        hoverBorderWidth: 10,
        labels: ["Active", "Inactive"],
        datasets: [
          {
            label: "Data One",
            backgroundColor,
            data: [activePercentage, inactivePercentage]
          }
        ]
      };

      // this.loaded = true;
    },

  };
</script>
