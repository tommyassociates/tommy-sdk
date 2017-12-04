require(['app','api','util','cache','tplManager'],
function (app,api,util,cache,tplManager) {

    //
    /// Test Data

    var TEST_DATA = {
      "data": [
        {
          "category": "Gastrointestinal Function",
          "range": "1.173 - 2.297",
          "result_display": "Severely Abnormal(+++)",
          "name": "Small Intestine Absorption Function Coefficient",
          "value": "4.260"
        },
        {
          "category": "Liver Function",
          "range": "116.340 - 220.621",
          "result_display": "Severely Abnormal(+++)",
          "name": "Protein Metabolism",
          "value": "59.859"
        },
        {
          "category": "Liver Function",
          "range": "0.097 - 0.419",
          "result_display": "Moderately Abnormal(++)",
          "name": "Liver Fat Content",
          "value": "0.616"
        },
        {
          "category": "Bone Mineral Density",
          "range": "0.209 - 0.751",
          "result_display": "Moderately Abnormal(++)",
          "name": "Amount of Calcium Loss",
          "value": "0.916"
        },
        {
          "category": "Bone Mineral Density",
          "range": "0.046 - 0.167",
          "result_display": "Moderately Abnormal(++)",
          "name": "Degree of Bone Hyperplasia",
          "value": "0.461"
        },
        {
          "category": "Bone Mineral Density",
          "range": "0.124 - 0.453",
          "result_display": "Moderately Abnormal(++)",
          "name": "Degree of Osteoporosis",
          "value": "0.723"
        },
        {
          "category": "Bone Mineral Density",
          "range": "0.433 - 0.796",
          "result_display": "Moderately Abnormal(++)",
          "name": "Bone Mineral Density",
          "value": "0.175"
        },
        {
          "category": "Rheumatoid Bone Disease",
          "range": "2.019 - 4.721",
          "result_display": "Moderately Abnormal(++)",
          "name": "Osteoporosis Coefficient",
          "value": "5.351"
        },
        {
          "category": "Blood Sugar",
          "range": "2.163 - 7.321",
          "result_display": "Increase",
          "name": "Blood Sugar Coefficient",
          "value": "7.783"
        },
        {
          "category": "Basic Physical Quality",
          "range": "33.967 - 37.642",
          "result_display": "Moderately Abnormal(++)",
          "name": "Water Shortage",
          "value": "29.045"
        },
        {
          "category": "Human Toxin",
          "range": "0.013 - 0.313",
          "result_display": "Moderately Abnormal(++)",
          "name": "Toxic Pesticide Residue",
          "value": "0.421"
        },
        {
          "category": "Trace Element",
          "range": "1.219 - 3.021",
          "result_display": "Moderately Abnormal(++)",
          "name": "Calcium",
          "value": "0.741"
        },
        {
          "category": "Trace Element",
          "range": "1.143 - 1.989",
          "result_display": "Moderately Abnormal(++)",
          "name": "Zinc",
          "value": "0.785"
        },
        {
          "category": "Trace Element",
          "range": "0.689 - 0.987",
          "result_display": "Moderately Abnormal(++)",
          "name": "Potassium",
          "value": "0.438"
        },
        {
          "category": "Skin",
          "range": "14.477 - 21.348",
          "result_display": "Severely Abnormal(+++)",
          "name": "Skin Grease Index",
          "value": "36.375"
        },
        {
          "category": "Skin",
          "range": "1.035 - 3.230",
          "result_display": "Moderately Abnormal(++)",
          "name": "Skin Immunity Index",
          "value": "6.684"
        },
        {
          "category": "Skin",
          "range": "0.218 - 0.953",
          "result_display": "Moderately Abnormal(++)",
          "name": "Skin Moisture Index",
          "value": "2.209"
        },
        {
          "category": "Skin",
          "range": "2.214 - 4.158",
          "result_display": "Moderately Abnormal(++)",
          "name": "Skin Moisture Loss",
          "value": "6.370"
        },
        {
          "category": "Vitamin",
          "range": "14.477 - 21.348",
          "result_display": "Moderately Abnormal(++)",
          "name": "Vitamin B3",
          "value": "11.665"
        },
        {
          "category": "Vitamin",
          "range": "4.543 - 5.023",
          "result_display": "Moderately Abnormal(++)",
          "name": "Vitamin C",
          "value": "3.668"
        },
        {
          "category": "Amino Acid",
          "range": "2.374 - 3.709",
          "result_display": "Moderately Abnormal(++)",
          "name": "Tryptophan",
          "value": "5.059"
        },
        {
          "category": "Bone Growth Index",
          "range": "0.433 - 0.796",
          "result_display": "Moderately Abnormal(++)",
          "name": "Bone alkaline phosphatase",
          "value": "0.255"
        },
        {
          "category": "Eye",
          "range": "0.510 - 3.109",
          "result_display": "Moderately Abnormal(++)",
          "name": "Bags under the eyes",
          "value": "9.649"
        },
        {
          "category": "Eye",
          "range": "2.031 - 3.107",
          "result_display": "Moderately Abnormal(++)",
          "name": "Collagen eye wrinkle",
          "value": "0.588"
        },
        {
          "category": "Eye",
          "range": "0.831 - 3.188",
          "result_display": "Moderately Abnormal(++)",
          "name": "Dark circles",
          "value": "7.077"
        },
        {
          "category": "Eye",
          "range": "1.116 - 4.101",
          "result_display": "Moderately Abnormal(++)",
          "name": "Lymphatic obstruction",
          "value": "8.653"
        },
        {
          "category": "Eye",
          "range": "0.118 - 0.892",
          "result_display": "Severely Abnormal(+++)",
          "name": "Eye cell activity",
          "value": "2.650"
        },
        {
          "category": "Eye",
          "range": "2.017 - 5.157",
          "result_display": "Moderately Abnormal(++)",
          "name": "Visual fatigue",
          "value": "8.410"
        },
        {
          "category": "Heavy Metal",
          "range": "0.052 - 0.643",
          "result_display": "Severely Abnormal(+++)",
          "name": "Lead",
          "value": "1.771"
        },
        {
          "category": "Heavy Metal",
          "range": "0.153 - 0.621",
          "result_display": "Moderately Abnormal(++)",
          "name": "Arsenic",
          "value": "1.899"
        },
        {
          "category": "Coenzyme",
          "range": "1.833 - 2.979",
          "result_display": "Moderately Abnormal(++)",
          "name": "Biotin",
          "value": "0.776"
        },
        {
          "category": "obesity",
          "range": "1.992 - 3.713",
          "result_display": "Moderately Abnormal(++)",
          "name": "Coefficient of lipid metabolism disorders",
          "value": "0.987"
        },
        {
          "category": "obesity",
          "range": "2.791 - 4.202",
          "result_display": "Moderately Abnormal(++)",
          "name": "Coefficient of brown adipose tissue abnormalities",
          "value": "2.027"
        },
        {
          "category": "obesity",
          "range": "0.097 - 0.215",
          "result_display": "Moderately Abnormal(++)",
          "name": "High coefficient of insulin hematic disease",
          "value": "0.453"
        },
        {
          "category": "obesity",
          "range": "1.341 - 1.991",
          "result_display": "Moderately Abnormal(++)",
          "name": "Coefficient of triglycerides were abnormal",
          "value": "5.224"
        },
        {
          "category": "collagen",
          "range": "4.533 - 6.179",
          "result_display": "Moderately Abnormal(++)",
          "name": "Hair and skin",
          "value": "2.659"
        },
        {
          "category": "collagen",
          "range": "6.352 - 8.325",
          "result_display": "Moderately Abnormal(++)",
          "name": "eye",
          "value": "3.744"
        },
        {
          "category": "meridians and collaterals",
          "range": "48.264 - 65.371",
          "result_display": "Moderately Abnormal(++)",
          "name": "Taiyin Lung Channel of Hand",
          "value": "38.091"
        },
        {
          "category": "meridians and collaterals",
          "range": "1.554 - 1.988",
          "result_display": "Severely Abnormal(+++)",
          "name": "gall bladder meridian",
          "value": "0.279"
        },
        {
          "category": "meridians and collaterals",
          "range": "1.553 - 2.187",
          "result_display": "Moderately Abnormal(++)",
          "name": "Jueyin liver meridian of foot",
          "value": "0.851"
        },
        {
          "category": "The pulse and cerebrovascular",
          "range": "60.735 - 65.396",
          "result_display": "Moderately Abnormal(++)",
          "name": "Index of the stroke",
          "value": "68.366"
        },
        {
          "category": "Large Intestine Function",
          "range": "4.572 - 6.483",
          "result_display": "Moderately Abnormal(++)",
          "name": "Large intestine peristalsis function coefficient",
          "value": "2.996"
        },
        {
          "category": "Large Intestine Function",
          "range": "2.946 - 3.815",
          "result_display": "Moderately Abnormal(++)",
          "name": "Colonic absorption coefficient",
          "value": "1.504"
        },
        {
          "category": "Large Intestine Function",
          "range": "1.734 - 2.621",
          "result_display": "Moderately Abnormal(++)",
          "name": "Intestinal bacteria coefficient",
          "value": "0.696"
        },
        {
          "category": "Large Intestine Function",
          "range": "1.173 - 2.297",
          "result_display": "Moderately Abnormal(++)",
          "name": "Intraluminal pressure coefficient",
          "value": "3.441"
        },
        {
          "category": "Thyroid",
          "range": "0.114 - 0.202",
          "result_display": "Moderately Abnormal(++)",
          "name": "Thyroglobulin",
          "value": "0.540"
        },
        {
          "category": "Thyroid",
          "range": "0.421 - 0.734",
          "result_display": "Severely Abnormal(+++)",
          "name": "Anti-thyroglobulin antibodies",
          "value": "0.103"
        },
        {
          "category": "Thyroid",
          "range": "0.160 - 0.300",
          "result_display": "Moderately Abnormal(++)",
          "name": "Three triiodothyronine (T3)",
          "value": "0.637"
        },
        {
          "category": "Blood lipids",
          "range": "0.726 - 1.281",
          "result_display": "Severely Abnormal(+++)",
          "name": "Meutral fat(MB)",
          "value": "6.969"
        },
        {
          "category": "Blood lipids",
          "range": "13.012 - 17.291",
          "result_display": "Moderately Abnormal(++)",
          "name": "Circulating immune complex(CIC)",
          "value": "23.073"
        },
        {
          "category": "Sperm and semen",
          "range": "1.502 - 6.028",
          "result_display": "Moderately Abnormal(++)",
          "name": "Semen volume",
          "value": "0.533"
        },
        {
          "category": "Sperm and semen",
          "range": "10.283 - 30.282",
          "result_display": "Moderately Abnormal(++)",
          "name": "liquefying time",
          "value": "6.718"
        },
        {
          "category": "Sperm and semen",
          "range": "0.637 - 0.877",
          "result_display": "Moderately Abnormal(++)",
          "name": "Sperm motility rate",
          "value": "0.375"
        },
        {
          "category": "Cardiocerebral Vascular",
          "range": "48.264 - 65.371",
          "result_display": "Moderately Abnormal(++)",
          "name": "Blood Viscosity",
          "value": "71.439"
        },
        {
          "category": "Cardiocerebral Vascular",
          "range": "0.481 - 1.043",
          "result_display": "Moderately Abnormal(++)",
          "name": "Blood Fat",
          "value": "1.770"
        },
        {
          "category": "Cardiocerebral Vascular",
          "range": "0.327 - 0.937",
          "result_display": "Severely Abnormal(+++)",
          "name": "Vascular Resistance",
          "value": "2.030"
        },
        {
          "category": "Cardiocerebral Vascular",
          "range": "0.192 - 0.412",
          "result_display": "Moderately Abnormal(++)",
          "name": "Myocardial Blood Demand",
          "value": "0.640"
        },
        {
          "category": "Cardiocerebral Vascular",
          "range": "1.338 - 1.672",
          "result_display": "Moderately Abnormal(++)",
          "name": "Stroke Volume",
          "value": "0.354"
        },
        {
          "category": "Cardiocerebral Vascular",
          "range": "0.669 - 1.544",
          "result_display": "Moderately Abnormal(++)",
          "name": "Left Ventricular Ejection Impedance",
          "value": "2.340"
        }
      ],
      "patient": {
        "name": "mason",
        "weight": 115,
        "mobile": null,
        "company": "Tommy",
        "height": 193,
        "birthday": "1984-03-20",
        "result": "VeryFat",
        "sex": "male",
        "age": 33
      },
      "measured_at": "2017-10-31 14:59"
    }

    TEST_DATA1 = {
      "data": [
        {
          "category": "\u5fc3\u8111\u8840\u7ba1",
          "range": "0.327 - 0.937",
          "result_display": "\u4e2d\u5ea6\u5f02\u5e38(++)",
          "name": "\u8840\u7ba1\u963b\u529b",
          "value": "1.650"
        },
        {
          "category": "\u8840\u7cd6",
          "range": "2.204 - 2.819",
          "result_display": "\u9633\u6027",
          "name": "\u5c3f\u7cd6\u7cfb\u6570",
          "value": "2.840"
        },
        {
          "category": "\u5185\u5206\u6ccc\u7cfb\u7edf",
          "range": "2.967 - 3.528",
          "result_display": "\u4e2d\u5ea6\u5f02\u5e38(++)",
          "name": "\u80f8\u817a\u5206\u6ccc\u6307\u6570",
          "value": "2.134"
        },
        {
          "category": "\u514d\u75ab\u7cfb\u7edf",
          "range": "58.425 - 61.213",
          "result_display": "\u4e2d\u5ea6\u5f02\u5e38(++)",
          "name": "\u80f8\u817a\u6307\u6570",
          "value": "53.806"
        },
        {
          "category": "\u7ef4\u751f\u7d20",
          "range": "4.543 - 5.023",
          "result_display": "\u4e2d\u5ea6\u5f02\u5e38(++)",
          "name": "\u7ef4\u751f\u7d20C",
          "value": "3.181"
        },
        {
          "category": "\u6c28\u57fa\u9178",
          "range": "2.374 - 3.709",
          "result_display": "\u4e2d\u5ea6\u5f02\u5e38(++)",
          "name": "\u8272\u6c28\u9178",
          "value": "4.979"
        },
        {
          "category": "\u773c\u90e8",
          "range": "0.118 - 0.892",
          "result_display": "\u4e2d\u5ea6\u5f02\u5e38(++)",
          "name": "\u773c\u5468\u7ec6\u80de\u6d3b\u6027",
          "value": "1.374"
        },
        {
          "category": "\u80a5\u80d6\u75c7",
          "range": "1.341 - 1.991",
          "result_display": "\u4e2d\u5ea6\u5f02\u5e38(++)",
          "name": "\u7518\u6cb9\u4e09\u916f\u542b\u91cf\u5f02\u5e38\u7cfb\u6570",
          "value": "3.786"
        },
        {
          "category": "\u80f6\u539f\u86cb\u767d",
          "range": "6.178 - 8.651",
          "result_display": "\u4e2d\u5ea6\u5f02\u5e38(++)",
          "name": "\u5185\u5206\u6ccc\u7cfb\u7edf",
          "value": "1.867"
        },
        {
          "category": "\u7ecf\u7edc",
          "range": "0.481 - 1.043",
          "result_display": "\u4e2d\u5ea6\u5f02\u5e38(++)",
          "name": "\u8db3\u9633\u660e\u80c3\u7ecf",
          "value": "0.126"
        },
        {
          "category": "\u7ecf\u7edc",
          "range": "1.553 - 2.187",
          "result_display": "\u91cd\u5ea6\u5f02\u5e38(+++)",
          "name": "\u8db3\u53a5\u9634\u809d\u7ecf",
          "value": "0.081"
        },
        {
          "category": "\u8109\u640f\u4e0e\u8111\u8840\u7ba1",
          "range": "60.735 - 65.396",
          "result_display": "\u4e2d\u5ea6\u5f02\u5e38(++)",
          "name": "\u4e2d\u98ce\u6307\u6570",
          "value": "65.396"
        }
      ],
      "patient": {
        "name": "Two",
        "weight": 60,
        "mobile": null,
        "company": null,
        "height": 170,
        "birthday": "1983-04-25",
        "result": "Fat",
        "sex": "female",
        "age": 34
      },
      "measured_at": "2013-04-26 15:20"
    }

    //
    /// Main View

    //
    /// Assessments Context
    //

    var Assessments = {

        // Item cache
        cache: {},

        current: null,
        currentItem: null,

        add: function (item) {
            // item = Assessments.coerce(item)
            Assessments.cache[item.id] = item;
            console.log('item added', item)
        },

        load: function (params) {
            // app.f7.showPreloader('Loading Biometric Data...')

            params = Object.assign({kind: 'Biometric'}, params)
            return api.getFragments(params).then(function(response) {
                console.log('biometrics response', response)
                if (response && response.length) {
                    for (var i = 0; i < response.length; i++) {
                        Assessments.add(response[i])
                    }
                }
            })
        },

        getData: function (id) {
            if (Assessments.cache[id])
                return Assessments.cache[id].data
        }
    }

    // Initialize the main page
    function initMain(page) {
        var $page = $$(page.container),
            $nav = $$(page.navbarInnerContainer)

        function render() {
            console.log('rendering biometrics')
            tplManager.renderInline('biometrics__assessmentListTemplate', Assessments.cache)
        }

        $nav.find('.biometrics__refresh').on('click', function () {
            Assessments.load().then(render)
        })

        Assessments.load().then(render)
    }

    // Initialize the assessment page
    function initAssessment(page) {
        var $page = $$(page.container),
            $nav = $$(page.navbarInnerContainer)

        function render(data) {
            console.log('rendering assessment', data)

            if (data && data.data) {
                tplManager.renderInline('biometrics__assessmentResultTemplate', calculateTotal(data.data))
                tplManager.renderInline('biometrics__patientProfileTemplate', data.patient)
                $table = tplManager.renderInline('biometrics__assessmentTableTemplate', data.data)

                $table.find('tr[data-href]').on('click', function () {
                    var url = $$(this).data('href')
                    // console.log('loading assessment item', url)
                    app.f7view.router.loadPage(url)
                })
            }
        }

        Assessments.load({cache: true}).then(function() {
            Assessments.current = Assessments.cache[page.query.fragment_id]
            render(Assessments.current.data)
        })
        // render(TEST_DATA)
        // render(TEST_DATA1)
    }

    // Initialize the assessment item page
    function initAssessmentItem(page) {
        var $page = $$(page.container),
            $nav = $$(page.navbarInnerContainer)

        try {
            var item = Assessments.current.data.data[page.query.item_id]
            // console.log('Assessments.current.item_id', page.query.item_id)
            // console.log('Assessments.current.data', Assessments.current.data)
            // console.log('item', item)
            console.log('assessment item', item)
            tplManager.renderInline('biometrics__assessmentItemTemplate', item)
        }
        catch(e) {
            alert('Cannot load assessment item')
        }
    }


    //
    /// Router

    app.f7.onPageInit('biometrics__main', initMain)
    app.f7.onPageInit('biometrics__assessment', initAssessment)
    app.f7.onPageInit('biometrics__assessment-item', initAssessmentItem)


    //
    /// Helpers

    function rangePercentage(input, range_min, range_max) {
      return ((input - range_min) * 100) / (range_max - range_min)
    }

    function calculateTotal(data) {
      var total = 0.0
      var percent = 0.0
      var label = 'Good'
      for (var i = 0; i < data.length; i++) {
        var item = data[i]
        var range = item.range.split('-')
        total += rangePercentage(item.value, parseFloat(range[0]), parseFloat(range[1]))
      }

      if (total > 8000) {
        label = 'Extreme'
        percent = 22
      }
      else if (total > 5000) {
        label = 'Unhealthy'
        percent = 37
      }
      else if (total > 1000) {
        label = 'Normal'
        percent = 66
      }
      else if (total > 100) {
        label = 'Good'
        percent = 72
      }
      else if (total < 100) {
        label = 'Healthy'
        percent = 86
      }
      else if (total < 50) {
        label = 'Very Healthy'
        percent = 96
      }

      return {
        total: total,
        label: label,
        percent: percent
      }
    }


    //
    /// Template7 Helpers

    app.t7.registerHelper('biometrics__assessmentIndex', function (index) {
        return parseInt(index) + 1
    })

    app.t7.registerHelper('biometrics__listTitle', function (fragment) {
        console.log(fragment.data.patient)
        var title = fragment.data.patient.name
        if (fragment.data.patient.email)
          title += ' (' + fragment.data.patient.email + ')'
        return title
    })

    app.t7.registerHelper('biometrics__listTime', function (fragment) {
        return fragment.data.measured_at
    })
})
