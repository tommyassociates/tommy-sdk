<template>
  <f7-page id="example__index">
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
            <free-trial></free-trial>
          </f7-block>
        </f7-col>
      </f7-row>

      <f7-row no-gap>
        <f7-col width="100">
          <f7-block strong inset>
            <f7-block-header>{{$t('dashboard.index.team_members.title')}}</f7-block-header>

            <f7-row no-gap>
              <f7-col width="100" tablet-width="50">

                <f7-row class="pb-8">
                  <f7-col width="40">
                    {{$t('dashboard.index.team_members.pending_invites')}}
                  </f7-col>
                  <f7-col width="60">
                    {{teamMembers.pending}} {{$t('dashboard.index.team_members.people')}}
                  </f7-col>
                </f7-row>
                <f7-row class="pb-8">
                  <f7-col width="40">
                    {{$t('dashboard.index.team_members.active')}}
                  </f7-col>
                  <f7-col width="60">
                    {{teamMembers.active}} {{$t('dashboard.index.team_members.people')}}
                  </f7-col>
                </f7-row>
                <f7-row class="pb-8">
                  <f7-col width="40">
                    {{$t('dashboard.index.team_members.inactive')}}
                  </f7-col>
                  <f7-col width="60">
                    {{teamMembers.inactive}} {{$t('dashboard.index.team_members.people')}}
                  </f7-col>
                </f7-row>
                <f7-row class="pb-8">
                  <f7-col width="40">
                    {{$t('dashboard.index.team_members.archived')}}
                  </f7-col>
                  <f7-col width="60">
                    {{teamMembers.archived}} {{$t('dashboard.index.team_members.people')}}
                  </f7-col>
                </f7-row>

              </f7-col>
              <f7-col width="100" tablet-width="50">
                <div v-if="loaded" style="max-width: 300px;">
                  <pie-chart :data="chartData" :options="chartOptions"></pie-chart>
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
  import freeTrial from '../components/free-trial';
  import tommyPlus from '../components/tommy-plus';

  export default {
    components: {
      PieChart,
      freeTrial,
      tommyPlus,
    },
    data() {
      return {
        loaded: false,
        teamMembers: {
          pending: 10,
          active: 200,
          inactive: 50,
          archived: 45,
        },
        chartData: null,
        chartOptions: {
          borderWidth: "10px",
          hoverBackgroundColor: "red",
          hoverBorderWidth: "10px",
          legend: {
            position: 'right',
          },
          animations: {
            duration: 2000,
          },
          layout: {
            padding: 0,
          }
        }
      };
    },
    methods: {},
    mounted() {
      const self = this;
      const total = +self.teamMembers.active + +self.teamMembers.inactive;
      const activePercentage = (+self.teamMembers.active * 100) / total;
      const inactivePercentage = (+self.teamMembers.inactive * 100) / total;

      self.chartData = {
        hoverBackgroundColor: "red",
        hoverBorderWidth: 10,
        labels: ["Active", "Inactive"],
        datasets: [
          {
            label: "Data One",
            backgroundColor: ["#2EC8A1", "#F5A623"],
            data: [activePercentage, inactivePercentage]
          }
        ]
      };

      self.loaded = true;


    }
  };
</script>
