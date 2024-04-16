import {Colors, FontFamily, NonIdealState, SpinnerWithText} from '@dagster-io/ui-components';
import {
  ActiveElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  ChartOptions,
  Filler,
  LinearScale,
  Tooltip,
} from 'chart.js';
import * as React from 'react';
import {useCallback, useMemo} from 'react';
import {Bar} from 'react-chartjs-2';

import {iconNameForMetric} from './IconForMetricName';
import {InsightsBarChartTooltip} from './InsightsBarChartTooltip';
import {EmptyStateContainer, LoadingStateContainer} from './InsightsChartShared';
import {formatMetric} from './formatMetric';
import {RenderTooltipFn, renderInsightsChartTooltip} from './renderInsightsChartTooltip';
import {BarDatapoint, BarValue, DatapointType, ReportingUnitType} from './types';
import {useRGBColorsForTheme} from '../app/useRGBColorsForTheme';
import {useFormatDateTime} from '../ui/useFormatDateTime';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Filler);

interface Props {
  loading: boolean;
  datapointType: DatapointType;
  unitType: ReportingUnitType;
  costMultiplier: number | null;
  metricName: string;
  metricLabel: string;
  timestamps: number[];
  datapoint: BarDatapoint;
  emptyState?: React.ReactNode;
}

const SPINNER_WAIT_MSEC = 1000;

export const InsightsBarChart = (props: Props) => {
  const {
    loading,
    datapointType,
    unitType,
    metricLabel,
    metricName,
    timestamps,
    datapoint,
    costMultiplier,
    emptyState,
  } = props;
  const {label, barColor, values} = datapoint;

  const rgbColors = useRGBColorsForTheme();
  const [canShowSpinner, setCanShowSpinner] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setCanShowSpinner(true);
    }, SPINNER_WAIT_MSEC);
    return () => clearTimeout(timer);
  }, []);

  const yMax = React.useMemo(() => {
    const allValues = values
      .filter((value): value is BarValue => value !== null)
      .map(({value}) => value);
    const maxValue = Math.max(...allValues);
    return Math.ceil(maxValue * 1.05);
  }, [values]);

  const formatDateTime = useFormatDateTime();

  // Don't show the y axis while loading datapoints, to avoid jumping renders.
  const showYAxis = values.length > 0;

  const data = React.useMemo(() => {
    const barColorRGB = rgbColors[barColor]!;
    return {
      labels: timestamps,
      datasets: [
        {
          label,
          data: values.map((value) => value?.value),
          backgroundColor: barColorRGB.replace(/, 1\)/, ', 0.6)'),
          hoverBackgroundColor: barColorRGB,
        },
      ],
    };
  }, [timestamps, label, values, rgbColors, barColor]);

  const onClick = useCallback(
    (element: ActiveElement | null) => {
      if (element) {
        const whichBar = values[element.index];
        console.log('Clicked', whichBar?.href);
        return;
      }
    },
    [values],
  );

  const renderTooltipFn: RenderTooltipFn = useCallback(
    (config) => {
      const {color, label, date, formattedValue} = config;
      return (
        <InsightsBarChartTooltip
          color={color}
          type={datapointType}
          label={label || ''}
          date={date}
          formattedValue={formattedValue}
          unitType={unitType}
          costMultiplier={costMultiplier}
          metricLabel={metricLabel}
        />
      );
    },
    [costMultiplier, datapointType, metricLabel, unitType],
  );

  const yAxis = useMemo(() => {
    return {
      display: showYAxis,
      grid: {
        color: rgbColors[Colors.keylineDefault()],
      },
      title: {
        display: true,
        text: metricLabel,
        font: {
          weight: '700',
          size: 14,
        },
      },
      ticks: {
        font: {
          color: {
            color: rgbColors[Colors.textLighter()],
          },
          size: 14,
          family: FontFamily.monospace,
        },
        callback(value: string | number) {
          return formatMetric(value, unitType, {
            integerFormat: 'compact',
            floatPrecision: 'maximum-precision',
            floatFormat: 'compact-above-threshold',
          });
        },
      },
      min: 0,
      suggestedMax: yMax,
    };
  }, [metricLabel, rgbColors, showYAxis, unitType, yMax]);

  const options: ChartOptions<'bar'> = React.useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event, elements) => onClick(elements[0] || null),
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: false,
          external: (context) => {
            return renderInsightsChartTooltip({...context, renderFn: renderTooltipFn});
          },
        },
      },
      interaction: {
        intersect: false,
        mode: 'x',
      },
      scales: {
        x: {
          display: true,
          grid: {
            display: false,
          },
          title: {
            display: true,
          },
          ticks: {
            font: {
              color: {
                color: rgbColors[Colors.textLighter()],
              },
              size: 14,
              family: FontFamily.monospace,
            },
            callback(timestamp) {
              const label = this.getLabelForValue(Number(timestamp));
              return formatDateTime(new Date(label), {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                timeZone: 'UTC',
              });
            },
          },
        },
        y: yAxis,
      },
    };
  }, [rgbColors, yAxis, onClick, renderTooltipFn, formatDateTime]);

  const emptyContent = () => {
    const anyDatapoints = values.length > 0;

    // If there is some data, we don't want to show a loading or empty state.
    // Or, if we shouldn't show the spinner yet (due to the delay) we also shouldn't
    // show anything yet.
    if (anyDatapoints || !canShowSpinner) {
      return null;
    }

    if (loading) {
      return (
        <LoadingStateContainer>
          <SpinnerWithText label="Loading…" />
        </LoadingStateContainer>
      );
    }

    return (
      <EmptyStateContainer>
        {emptyState || (
          <NonIdealState
            icon={iconNameForMetric(metricName)}
            title="No results found"
            description={
              <span>
                No data was found for <strong>{metricLabel}</strong> for these filters.
              </span>
            }
          />
        )}
      </EmptyStateContainer>
    );
  };

  return (
    <div style={{height: '100%', position: 'relative'}}>
      {emptyContent()}
      <Bar key={datapointType} data={data} options={options} />
    </div>
  );
};
