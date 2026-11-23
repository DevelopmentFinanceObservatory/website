// Test data for _lib's tests: seven donors' figures as DFO's DAC1 reads gave them in November
// 2026, the page's definitions, and the currencies Search converted the series to. The tests
// check the page's arithmetic and wording on them. The page reads every figure at build
// (_lib/build.ts).
import type { CountsData, Definition, Offer } from '../_data/types.ts';

// prettier-ignore
export const COUNTS: CountsData = {
    "years": [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
    "baseYear": 2024,
    "donors": [
        {
            "name": "Australia",
            "isGroup": false,
            "id": "country/AUS",
            "series": {
                "gross": { "current": [3497.35, 3280.73, 3065.01, 3152.2, 2897.74, 2868.76, 3559.47, 3084.6, 3254.84, 3686.59, 3315.15], "constant": [4168.95, 3917.44, 3428.59, 3535.36, 3382.64, 3346.47, 3598.11, 3117.89, 3318.47, 3686.59, 3315.07] },
                "net": { "current": [3493.61, 3277.52, 3035.96, 3149.0, 2888.43, 2868.76, 3546.44, 3078.79, 3250.51, 3654.84, 3244.57], "constant": [4164.5, 3913.61, 3396.1, 3531.77, 3371.77, 3346.47, 3584.94, 3112.02, 3314.05, 3654.84, 3244.49] },
                "grantEquivalent": { "current": [3222.45, 3277.52, 3035.96, 3149.0, 2897.74, 2868.76, 3546.44, 3045.98, 3253.29, 3384.14, 3291.2], "constant": [3841.26, 3913.61, 3396.1, 3531.77, 3382.64, 3346.47, 3584.94, 3078.85, 3316.89, 3384.14, 3291.12] },
                "commitments": { "current": [3489.34, 3277.52, 3035.96, 3149.0, 2888.43, 3310.7, 3559.47, 3084.6, 3254.84, 3682.25, null], "constant": [4159.41, 3913.61, 3396.1, 3531.77, 3371.77, 3862.0, 3598.11, 3117.89, 3318.47, 3682.25, null] },
                "headline": { "current": [3493.61, 3277.52, 3035.96, 3149.0, 2897.74, 2868.76, 3546.44, 3045.98, 3253.29, 3384.14, 3291.2], "constant": [4164.5, 3913.61, 3396.1, 3531.77, 3382.64, 3346.47, 3584.94, 3078.85, 3316.89, 3384.14, 3291.12] },
                "bilateral": { "current": [2755.93, 2293.66, 2441.34, 2553.58, 2234.23, 2318.95, 3080.84, 2623.13, 2721.61, 3007.48, null], "constant": [3285.16, 2738.8, 2730.94, 2863.98, 2608.1, 2705.1, 3114.28, 2651.44, 2774.81, 3007.48, null] },
                "multilateral": { "current": [741.42, 987.07, 623.67, 598.62, 663.51, 549.81, 478.63, 461.47, 533.23, 679.11, null], "constant": [883.8, 1178.64, 697.65, 671.38, 774.54, 641.36, 483.83, 466.45, 543.65, 679.11, null] },
                "refugeeCosts": { "current": [null, null, null, null, null, null, null, null, null, null, null], "constant": [null, null, null, null, null, null, null, null, null, null, null] },
                "grossNonGrants": { "current": [14.12, null, null, null, null, null, null, 90.53, 4.42, 380.42, null], "constant": [16.83, null, null, null, null, null, null, 91.51, 4.51, 380.42, null] }
            },
            "odaGni": [0.291, 0.266, 0.232, 0.23, 0.215, 0.214, 0.221, 0.187, 0.194, 0.195, 0.184]
        },
        {
            "name": "Finland",
            "isGroup": false,
            "id": "country/FIN",
            "series": {
                "gross": { "current": [1308.36, 1060.0, 1094.23, 1002.58, 1152.15, 1275.99, 1499.52, 1632.71, 1686.78, 1381.89, 1340.63], "constant": [1535.77, 1247.42, 1252.75, 1074.96, 1283.38, 1373.69, 1517.82, 1750.39, 1699.31, 1381.89, 1264.89] },
                "net": { "current": [1288.0, 1059.61, 1083.79, 984.0, 1149.3, 1277.89, 1497.6, 1615.08, 1643.15, 1366.53, 1335.08], "constant": [1511.87, 1246.96, 1240.8, 1055.04, 1280.21, 1375.74, 1515.88, 1731.49, 1655.35, 1366.53, 1259.65] },
                "grantEquivalent": { "current": [1291.53, 1059.67, 1083.79, 984.0, 1130.77, 1278.17, 1441.22, 1615.62, 1586.15, 1408.0, 1411.26], "constant": [1516.02, 1247.03, 1240.8, 1055.04, 1259.56, 1376.04, 1458.81, 1732.06, 1597.93, 1408.0, 1331.53] },
                "commitments": { "current": [877.22, 903.7, 1016.21, 1043.33, 1198.02, 1259.66, 1660.41, 1729.04, 1542.5, 1306.33, null], "constant": [1029.69, 1063.48, 1163.43, 1118.66, 1334.47, 1356.11, 1680.67, 1853.66, 1553.96, 1306.33, null] },
                "headline": { "current": [1288.0, 1059.61, 1083.79, 984.0, 1130.77, 1278.17, 1441.22, 1615.62, 1586.15, 1408.0, 1411.26], "constant": [1511.87, 1246.96, 1240.8, 1055.04, 1259.56, 1376.04, 1458.81, 1732.06, 1597.93, 1408.0, 1331.53] },
                "bilateral": { "current": [718.23, 638.79, 608.39, 494.35, 604.46, 656.94, 704.09, 1036.58, 941.21, 768.15, null], "constant": [843.07, 751.74, 696.53, 530.04, 673.31, 707.24, 712.68, 1111.29, 948.2, 768.15, null] },
                "multilateral": { "current": [590.14, 421.2, 485.84, 508.23, 547.69, 622.3, 795.43, 596.12, 745.57, 613.73, null], "constant": [692.72, 495.67, 556.22, 544.92, 610.07, 669.95, 805.14, 639.08, 751.11, 613.73, null] },
                "refugeeCosts": { "current": [39.04, 130.19, 77.43, 56.96, 89.59, 59.46, 68.77, 409.9, 249.5, 274.31, 230.92], "constant": [45.83, 153.21, 88.65, 61.07, 99.79, 64.01, 69.61, 439.44, 251.35, 274.31, 217.87] },
                "grossNonGrants": { "current": [43.81, 22.28, 38.42, 52.75, 111.28, 107.39, 263.11, 107.22, 265.51, null, null], "constant": [51.42, 26.22, 43.99, 56.56, 123.95, 115.61, 266.32, 114.95, 267.48, null, null] }
            },
            "odaGni": [0.55, 0.44, 0.424, 0.359, 0.417, 0.468, 0.474, 0.574, 0.535, 0.471, 0.443]
        },
        {
            "name": "France",
            "isGroup": false,
            "id": "country/FRA",
            "series": {
                "gross": { "current": [10943.74, 11741.8, 13654.35, 15382.81, 14543.97, 18616.88, 19369.95, 20295.18, 17698.47, 18081.57, 17508.38], "constant": [12707.69, 13605.08, 15431.83, 16421.48, 16173.71, 19747.09, 19560.66, 22371.4, 18072.33, 18081.57, 16589.69] },
                "net": { "current": [9039.3, 9621.67, 11330.86, 12839.67, 11984.15, 16013.14, 16721.92, 17560.93, 15861.98, 15073.83, 13905.74], "constant": [10496.28, 11148.51, 12805.87, 13706.62, 13327.05, 16985.28, 16886.56, 19357.43, 16197.05, 15073.83, 13176.08] },
                "grantEquivalent": { "current": [8862.3, 9586.58, 10698.82, 12136.17, 12211.36, 14124.7, 15505.62, 16016.25, 15081.36, 15448.26, 14532.9], "constant": [10290.76, 11107.85, 12091.56, 12955.62, 13579.72, 14982.2, 15658.29, 17654.73, 15399.94, 15448.26, 13770.34] },
                "commitments": { "current": [12978.23, 12370.6, 16718.73, 14683.28, 18346.69, 24910.45, 21696.57, 23775.07, 19330.39, 18505.99, null], "constant": [15070.1, 14333.66, 18895.12, 15674.71, 20402.55, 26422.74, 21910.19, 26207.29, 19738.72, 18505.99, null] },
                "headline": { "current": [9039.3, 9621.67, 11330.86, 12136.17, 12211.36, 14124.7, 15505.62, 16016.25, 15081.36, 15448.26, 14532.9], "constant": [10496.28, 11148.51, 12805.87, 12955.62, 13579.72, 14982.2, 15658.29, 17654.73, 15399.94, 15448.26, 13770.34] },
                "bilateral": { "current": [6798.64, 7426.01, 8645.87, 9545.06, 9660.22, 13088.71, 12809.81, 13168.01, 11105.97, 11330.53, null], "constant": [7894.47, 8604.43, 9771.36, 10189.55, 10742.71, 13883.31, 12935.93, 14515.11, 11340.57, 11330.53, null] },
                "multilateral": { "current": [4145.11, 4315.75, 5008.48, 5837.75, 4883.75, 5528.18, 6560.14, 7127.17, 6592.5, 6751.05, null], "constant": [4813.23, 5000.61, 5660.47, 6231.92, 5431.0, 5863.79, 6624.73, 7856.29, 6731.76, 6751.05, null] },
                "refugeeCosts": { "current": [363.35, 466.57, 622.65, 801.66, 1209.67, 1223.86, 1156.48, 1531.95, 1281.81, 1227.19, 1129.67], "constant": [421.92, 540.61, 703.7, 855.79, 1345.22, 1298.16, 1167.87, 1688.67, 1308.89, 1227.19, 1070.39] },
                "grossNonGrants": { "current": [3458.52, 3333.92, 4878.69, 5931.55, 4622.47, 8204.64, 7289.79, 7290.47, 4519.17, 4713.61, null], "constant": [4015.98, 3862.97, 5513.78, 6332.06, 5140.45, 8702.74, 7361.56, 8036.29, 4614.63, 4713.61, null] }
            },
            "odaGni": [0.368, 0.384, 0.428, 0.427, 0.441, 0.53, 0.51, 0.56, 0.485, 0.478, 0.423]
        },
        {
            "name": "Spain",
            "isGroup": false,
            "id": "country/ESP",
            "series": {
                "gross": { "current": [1798.74, 4536.09, 2962.86, 2977.6, 2986.9, 3039.52, 3718.65, 4316.66, 3917.84, 4349.19, 5233.92], "constant": [2171.61, 5473.03, 3463.29, 3285.36, 3425.6, 3385.89, 3892.33, 4853.13, 4032.03, 4349.19, 4901.17] },
                "net": { "current": [1396.74, 4223.67, 2560.3, 2589.59, 2708.7, 2739.27, 3358.48, 4046.53, 3650.44, 4124.4, 4967.53], "constant": [1686.28, 5096.08, 2992.74, 2857.24, 3106.54, 3051.43, 3515.34, 4549.43, 3756.84, 4124.4, 4651.72] },
                "grantEquivalent": { "current": [1603.77, 4579.72, 2558.96, 2890.3, 2943.5, 2987.04, 3641.9, 4275.53, 3879.84, 4345.54, 5135.91], "constant": [1936.22, 5525.67, 2991.17, 3189.03, 3375.82, 3327.43, 3812.0, 4806.89, 3992.92, 4345.54, 4809.39] },
                "commitments": { "current": [1732.22, 4613.3, 2986.2, 3091.16, 2974.1, 3017.25, 3805.8, 4525.53, 4064.76, 4548.56, null], "constant": [2091.3, 5566.19, 3490.57, 3410.65, 3410.92, 3361.09, 3983.55, 5087.95, 4183.23, 4548.56, null] },
                "headline": { "current": [1396.74, 4223.67, 2560.3, 2890.3, 2943.5, 2987.04, 3641.9, 4275.53, 3879.84, 4345.54, 5135.91], "constant": [1686.28, 5096.08, 2992.74, 3189.03, 3375.82, 3327.43, 3812.0, 4806.89, 3992.92, 4345.54, 4809.39] },
                "bilateral": { "current": [756.57, 2855.52, 1086.22, 1095.3, 1080.49, 1036.17, 1530.85, 2247.63, 1558.29, 1761.73, null], "constant": [913.4, 3445.34, 1269.68, 1208.51, 1239.19, 1154.25, 1602.35, 2526.96, 1603.71, 1761.73, null] },
                "multilateral": { "current": [1042.17, 1680.57, 1876.64, 1882.3, 1906.41, 2003.35, 2187.8, 2069.02, 2359.55, 2587.46, null], "constant": [1258.21, 2027.7, 2193.61, 2076.85, 2186.41, 2231.65, 2289.98, 2326.15, 2428.32, 2587.46, null] },
                "refugeeCosts": { "current": [32.29, 88.55, 216.92, 275.54, 299.83, 194.62, 232.08, 907.05, 318.97, 446.99, 729.25], "constant": [38.98, 106.84, 253.56, 304.02, 343.87, 216.8, 242.92, 1019.78, 328.27, 446.99, 682.89] },
                "grossNonGrants": { "current": [31.02, 82.69, 33.04, 21.29, 30.71, 29.92, 40.04, 35.45, 60.43, 17.45, null], "constant": [37.45, 99.77, 38.62, 23.49, 35.22, 33.33, 41.91, 39.86, 62.19, 17.45, null] }
            },
            "odaGni": [0.117, 0.343, 0.195, 0.203, 0.209, 0.233, 0.257, 0.303, 0.241, 0.254, 0.271]
        },
        {
            "name": "Taiwan",
            "isGroup": false,
            "id": "country/TWN",
            "series": {
                "gross": { "current": [279.32, 343.77, 333.48, 299.46, 321.47, 511.21, 346.36, null, 488.76, 400.3, 460.78], "constant": [331.02, 411.91, 391.32, 337.45, 367.94, 567.52, 361.63, null, 500.43, 400.3, 438.03] },
                "net": { "current": [254.76, 327.54, 319.31, 291.54, 315.85, 504.16, 328.9, null, 471.48, 381.24, 398.25], "constant": [301.92, 392.47, 374.69, 328.52, 361.51, 559.7, 343.4, null, 482.74, 381.24, 378.59] },
                "grantEquivalent": { "current": [null, null, null, 298.3, 312.0, 406.35, 320.97, 383.59, 468.45, 403.46, 445.7], "constant": [null, null, null, 336.14, 357.1, 451.11, 335.12, null, 479.63, 403.46, 423.69] },
                "commitments": { "current": [null, null, null, null, null, 136.0, 55.0, null, 468.76, 10427.63, null], "constant": [null, null, null, null, null, 150.98, 57.43, null, 479.95, 10427.63, null] },
                "headline": { "current": [254.76, 327.54, 319.31, 298.3, 312.0, 406.35, 320.97, 383.59, 468.45, 403.46, 445.7], "constant": [301.92, 392.47, 374.69, 336.14, 357.1, 451.11, 335.12, null, 479.63, 403.46, 423.69] },
                "bilateral": { "current": [225.04, 306.01, 300.63, 265.34, 258.25, 213.62, 193.24, null, 480.12, 400.3, null], "constant": [266.7, 366.67, 352.77, 299.0, 295.58, 237.15, 201.76, null, 491.58, 400.3, null] },
                "multilateral": { "current": [54.28, 37.76, 32.85, 34.12, 63.23, 297.59, 153.12, null, 8.63, null, null], "constant": [64.33, 45.24, 38.55, 38.45, 72.37, 330.37, 159.87, null, 8.84, null, null] },
                "refugeeCosts": { "current": [null, null, null, null, null, null, null, null, 0.03, 0.02, null], "constant": [null, null, null, null, null, null, null, null, 0.03, 0.02, null] },
                "grossNonGrants": { "current": [12.01, 13.1, 0.43, 1.39, 14.8, 156.9, 35.96, null, 27.05, 3.22, null], "constant": [14.23, 15.7, 0.5, 1.57, 16.94, 174.18, 37.55, null, 27.7, 3.22, null] }
            },
            "odaGni": [0.047, 0.06, 0.056, 0.051, 0.05, 0.059, 0.041, 0.049, 0.06, 0.049, 0.047]
        },
        {
            "name": "United Kingdom",
            "isGroup": false,
            "id": "country/GBR",
            "series": {
                "gross": { "current": [18684.15, 18204.4, 18219.86, 19643.14, 19610.41, 19459.47, 16489.95, 15907.48, 18858.3, 16592.77, 16664.05], "constant": [20734.02, 22481.38, 23223.24, 23704.85, 24141.26, 22735.3, 17836.75, 18167.87, 20085.68, 16592.77, 15567.19] },
                "net": { "current": [18552.85, 18052.8, 18093.34, 19449.18, 19344.6, 19253.43, 16277.78, 15761.32, 18615.65, 16269.51, 16365.1], "constant": [20588.31, 22294.16, 23061.98, 23470.79, 23814.04, 22494.57, 17607.25, 18000.94, 19827.24, 16269.51, 15287.91] },
                "grantEquivalent": { "current": [18644.58, 17395.24, 16085.18, 19397.19, 19366.89, 18568.19, 15712.01, 15761.81, 19072.68, 17991.79, 17175.72], "constant": [20690.11, 21482.11, 20502.35, 23408.05, 23841.48, 21693.98, 16995.27, 18001.5, 20314.01, 17991.79, 16045.18] },
                "commitments": { "current": [13373.46, 11138.8, 12457.87, 8992.83, 17099.5, 11365.04, 7476.78, 7216.84, 15436.36, 16245.34, null], "constant": [14840.68, 13755.77, 15878.94, 10852.32, 21050.22, 13278.24, 8087.44, 8242.33, 16441.03, 16245.34, null] },
                "headline": { "current": [18552.85, 18052.8, 18093.34, 19397.19, 19366.89, 18568.19, 15712.01, 15761.81, 19072.68, 17991.79, 17175.72], "constant": [20588.31, 22294.16, 23061.98, 23408.05, 23841.48, 21693.98, 16995.27, 18001.5, 20314.01, 17991.79, 16045.18] },
                "bilateral": { "current": [11849.26, 11668.7, 11451.07, 12479.34, 13498.55, 12381.1, 9981.55, 12029.27, 12127.08, 13004.05, null], "constant": [13149.26, 14410.17, 14595.66, 15059.76, 16617.3, 14465.35, 10796.78, 13738.58, 12916.36, 13004.05, null] },
                "multilateral": { "current": [6834.89, 6535.73, 6768.79, 7163.8, 6111.86, 7078.37, 6508.4, 3878.21, 6731.22, 3588.72, null], "constant": [7584.76, 8071.25, 8627.58, 8645.1, 7523.96, 8269.95, 7039.97, 4429.29, 7169.32, 3588.72, null] },
                "refugeeCosts": { "current": [390.49, 574.03, 491.83, 493.1, 609.23, 805.2, 1447.37, 4549.34, 5311.44, 3612.25, 3155.08], "constant": [433.33, 708.89, 626.89, 595.06, 749.99, 940.75, 1565.58, 5195.78, 5657.13, 3612.25, 2947.41] },
                "grossNonGrants": { "current": [284.43, 1085.59, 2030.3, 136.87, 77.06, 1191.49, 1234.59, 119.83, 21.24, 13.23, null], "constant": [315.64, 1340.64, 2587.84, 165.17, 94.86, 1392.07, 1335.42, 136.86, 22.62, 13.23, null] }
            },
            "odaGni": [0.705, 0.7, 0.698, 0.695, 0.703, 0.698, 0.504, 0.51, 0.579, 0.498, 0.432]
        },
        {
            "name": "DAC countries",
            "isGroup": true,
            "id": "DACCountriesTotal",
            "series": {
                "gross": { "current": [143395.35, 157909.04, 161748.13, 165200.7, 161644.81, 177348.89, 200115.81, 228176.12, 240312.97, 225956.99, 186361.78], "constant": [169939.29, 189209.85, 189802.35, 186156.32, 185011.36, 196884.53, 208940.31, 245278.79, 246049.77, 225956.99, 177136.81] },
                "net": { "current": [131826.38, 145266.71, 147502.81, 150440.75, 146880.22, 163026.67, 185415.34, 213909.57, 226734.74, 212462.16, 171570.85], "constant": [156228.78, 174061.55, 173086.26, 169524.08, 168112.48, 180984.66, 193591.6, 229942.91, 232147.4, 212462.16, 163078.04] },
                "grantEquivalent": { "current": [null, null, null, 153878.49, 152124.31, 162669.99, 186550.51, 211214.63, 223921.17, 215141.78, 174301.55], "constant": [null, null, null, 173397.9, 174114.63, 180588.69, 194776.82, 227045.97, 229266.66, 215141.78, 165673.57] },
                "commitments": { "current": [153538.16, 162270.11, 167286.48, 166435.36, 168245.09, 188963.15, 201008.05, 228091.71, 248675.73, 222092.39, null], "constant": [181959.64, 194435.37, 196301.29, 187547.6, 192565.75, 209778.14, 209871.9, 245188.06, 254612.17, 222092.39, null] },
                "headline": { "current": [131826.38, 145266.71, 147502.81, 153878.49, 152124.31, 162669.99, 186550.51, 211214.63, 223921.17, 215141.78, 174301.55], "constant": [156228.78, 174061.55, 173086.26, 173397.9, 174114.63, 180588.69, 194776.82, 227045.97, 229266.66, 215141.78, 165673.57] },
                "bilateral": { "current": [105601.04, 115483.02, 119542.78, 119650.72, 117898.41, 128980.39, 143844.61, 177210.75, 178640.75, 174427.75, null], "constant": [125148.87, 138374.12, 140276.74, 134828.35, 134941.21, 143188.06, 150187.72, 190493.38, 182905.3, 174427.75, null] },
                "multilateral": { "current": [37794.33, 42425.97, 42205.32, 45549.99, 43746.36, 48371.73, 56271.15, 50965.33, 61672.19, 51529.22, null], "constant": [44790.45, 50835.67, 49525.57, 51327.98, 50070.11, 53700.06, 58752.54, 54785.38, 63144.44, 51529.22, null] },
                "refugeeCosts": { "current": [12116.91, 15965.56, 14115.93, 10774.27, 9637.86, 8749.23, 12841.88, 31091.15, 32700.31, 27976.42, 22971.65], "constant": [14359.87, 19130.26, 16564.25, 12140.98, 11031.06, 9712.99, 13408.17, 33421.55, 33480.94, 27976.42, 21834.55] },
                "grossNonGrants": { "current": [17942.83, 18990.36, 23017.61, 22347.17, 21321.68, 30658.56, 29208.55, 33092.51, 33662.38, 27220.99, null], "constant": [21264.23, 22754.64, 27009.87, 25181.9, 24403.83, 34035.71, 30496.56, 35572.92, 34465.98, 27220.99, null] }
            },
            "odaGni": [0.3, 0.32, 0.31, 0.3, 0.3, 0.32, 0.33, 0.37, 0.37, 0.34, 0.26]
        }
    ]
};

// prettier-ignore
export const DEFINITIONS: Definition[] = [
    {
        "id": "Gross",
        "label": "gross",
        "description": "An amount counted in full, with nothing offset.",
        "source": "graph"
    },
    {
        "id": "Net",
        "label": "net",
        "description": "An amount counted after offsetting amounts are subtracted.",
        "source": "graph"
    },
    {
        "id": "Disbursement",
        "label": "disbursement",
        "description": "The placing of resources at the recipient's disposal.",
        "source": "graph"
    },
    {
        "id": "Commitment",
        "label": "commitment",
        "description": "A firm, written promise to provide specified resources.",
        "source": "graph"
    },
    {
        "id": "grantEquivalent",
        "label": "grant equivalent",
        "description": "A measure of the provider's effort: the amount effectively given through a transaction, equal to its face value multiplied by its grant element. A grant is given in full; a loan gives only the portion extended by lending below market rates, so more concessional terms yield a higher grant equivalent.",
        "source": "graph"
    },
    {
        "id": "grantElement",
        "label": "grant element",
        "description": "The gift portion of a loan, as a percentage of the amount committed. It is the face value less the discounted present value of the contractual debt service, over the face value.",
        "source": "graph"
    },
    {
        "id": "Nominal",
        "label": "current prices",
        "description": "Measurement is evaluated at current market prices, without adjusting for inflation.",
        "source": "graph"
    },
    {
        "id": "oecdHeadline",
        "label": "OECD headline ODA",
        "description": "Starting with 2018 data, the new grant equivalent measure of ODA became the standard for reporting, with the headline ODA figures published on that basis.",
        "url": "https://www.oecd.org/en/topics/sub-issues/oda-eligibility-and-conditions/official-development-assistance--definition-and-coverage.html",
        "source": "oecd"
    },
    {
        "id": "constantPrices",
        "label": "constant dollars",
        "description": "In DAC publications, flow data are expressed in US dollars (USD). To give a truer idea of the volume of flows over time, data can be presented in constant prices and exchange rates, with a reference year specified. This means that adjustment has been made to cover both inflation in the donor’s currency between the year in question and the reference year, and changes in the exchange rate between that currency and the United States dollar over the same period.",
        "url": "https://www.oecd.org/en/topics/sub-issues/oda-standards/glossary-of-statistical-terms-and-concepts-of-development-finance.html",
        "source": "oecd"
    }
];

// prettier-ignore
export const OFFER: Offer = {
    "defaultBaseYear": 2024,
    "currencies": [
        {
            "code": "AUD",
            "noun": "Australian dollars",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1960,
            "base_year_max": 2025
        },
        {
            "code": "CAD",
            "noun": "Canadian dollars",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1960,
            "base_year_max": 2025
        },
        {
            "code": "CHF",
            "noun": "Swiss francs",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1960,
            "base_year_max": 2025
        },
        {
            "code": "CZK",
            "noun": "Czech korunas",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1998,
            "base_year_max": 2025
        },
        {
            "code": "DKK",
            "noun": "Danish kroner",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1960,
            "base_year_max": 2025
        },
        {
            "code": "EUR",
            "noun": "euros",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1973,
            "base_year_max": 2025
        },
        {
            "code": "GBP",
            "noun": "British pounds",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1960,
            "base_year_max": 2025
        },
        {
            "code": "HUF",
            "noun": "Hungarian forints",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 2003,
            "base_year_max": 2025
        },
        {
            "code": "ISK",
            "noun": "Icelandic krónur",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1997,
            "base_year_max": 2025
        },
        {
            "code": "JPY",
            "noun": "Japanese yen",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1960,
            "base_year_max": 2025
        },
        {
            "code": "KRW",
            "noun": "South Korean won",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1987,
            "base_year_max": 2025
        },
        {
            "code": "NOK",
            "noun": "Norwegian kroner",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1960,
            "base_year_max": 2025
        },
        {
            "code": "NZD",
            "noun": "New Zealand dollars",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1961,
            "base_year_max": 2025
        },
        {
            "code": "PLN",
            "noun": "Polish zlotys",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1998,
            "base_year_max": 2025
        },
        {
            "code": "SEK",
            "noun": "Swedish kronor",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1960,
            "base_year_max": 2025
        },
        {
            "code": "USD",
            "noun": "US dollars",
            "current_years": { "start_year": 2015, "end_year": 2025 },
            "constant_years": { "start_year": 2015, "end_year": 2025 },
            "base_year_min": 1960,
            "base_year_max": 2025
        }
    ]
};
