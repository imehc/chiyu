import { type Group, Vector3 } from "three";
import labelIcon from "/texture/label-icon.png";
import { cn } from "../../../utils/cn";
import { buildFocusLabelHtml } from "../utils/focus-label";
import type Label3D from "../world-core/components/label-3d";
import type { Label } from "../world-core/components/label-3d";
import type {
	BarLabelOptions,
	DecorationLabel,
	IconLabel,
	LabelContext,
	MapFocusLabelInfo,
	MapPoint,
	MonitoringLabelData,
	MonitoringLabelOptions,
	ProjectPoint,
} from "./types";

/** The scene supplies data and projection; label factories own the markup. */
export function createMapLabels(
	{ label3d, labelGroup, project }: LabelContext,
	decorations: DecorationLabel[],
	focus: MapFocusLabelInfo,
	icons: IconLabel[],
): Label[] {
	const labels: Label[] = [];
	decorations.forEach((province) => {
		if (province.hide === true) return;
		labels.push(createDecorationLabel(province, label3d, labelGroup, project));
	});
	labels.push(createFocusLabel({ ...focus }, label3d, labelGroup, project));
	icons.forEach((icon) => {
		labels.push(createIconLabel(icon, label3d, labelGroup, project));
	});
	return labels;
}

function createDecorationLabel(
	province: DecorationLabel,
	label3d: Label3D,
	labelGroup: Group,
	project: ProjectPoint,
) {
	const label = label3d.create(
		"",
		cn("tw:text-white tw:text-xs tw:will-change-transform", {
			"tw:blur-xxs": province.blur,
		}),
		false,
	);
	const [x, y] = project(province.center as MapPoint);
	label.init(
		`<div id="other-label" class="${cn(
			"tw:flex tw:items-center tw:p-1 tw:rounded-sm",
			"tw:bg-[#00000099] tw:will-change-transform",
			"tw:translate-y-[200%] tw:opacity-0 tw:bg-none",
		)}">
			<img class="tw:block tw:size-5 tw:mr-2" src="${labelIcon}">
			${province.name}
		</div>`,
		new Vector3(x, -y, 0.4),
	);
	label3d.setLabelStyle(label, 0.02, "x");
	label.setParent(labelGroup);
	return label;
}

function createFocusLabel(
	province: MapFocusLabelInfo,
	label3d: Label3D,
	labelGroup: Group,
	project: ProjectPoint,
) {
	const label = label3d.create(
		"",
		"tw:p-1 tw:text-white tw:will-change-transform tw:tracking-wider tw:text-4xl tw:font-bold",
		false,
	);
	const [x, y] = project(province.center);
	label.init(buildFocusLabelHtml(province), new Vector3(x, -y, 0.4));
	label3d.setLabelStyle(label, 0.015, "x");
	label.setParent(labelGroup);
	return label;
}

function createIconLabel(
	data: IconLabel,
	label3d: Label3D,
	labelGroup: Group,
	project: ProjectPoint,
) {
	const label = label3d.create(
		"",
		cn("decoration-label", { "": data.reflect }),
		false,
	);
	const [x, y] = project(data.center);
	label.init(
		`<div id="other-label" class="tw:translate-y-[200%] tw:opacity-0 tw:bg-none tw:will-change-transform">
			<img class="tw:block tw:size-10" style="width:${data.width};height:${data.height}" src="${data.icon}">
		</div>
		`,
		new Vector3(x, -y, 0.4),
	);
	label3d.setLabelStyle(label, 0.02, "x");
	label.setParent(labelGroup);
	return label;
}

export function createBarLabel(
	{ label3d, labelGroup }: LabelContext,
	{ data, index, position, unit }: BarLabelOptions,
) {
	const label = label3d.create("", "provinces-label", false);
	label.init(
		`<div>
                    <div id="provinces-label-wrap" class="${cn(
											"tw:translate-x-1/2 tw:translate-y-[200%] tw:opacity-0",
											"tw:flex tw:justify-between tw:items-center tw:px-5",
											"tw:h-13 tw:rounded-3xl tw:rounded-bl-none",
											"tw:bg-[#00000066] tw:box-border tw:gap-x-2",
										)}">
                        <div id="number" class="tw:text-white tw:text-3xl tw:font-bold tw:whitespace-nowrap">
                            <span id="value">${data.value}</span>
                            <span class="tw:text-white tw:text-xs tw:font-normal tw:opacity-50 tw:pl-1">${unit}</span>
                        </div>
                        <div class="tw:text-white tw:text-base tw:font-bold">
                            <span class="tw:block">${data.name}</span>
                            <span class="tw:block tw:text-white tw:text-xxs tw:opacity-50 tw:font-bold">${data.enName.toUpperCase()}</span>
                        </div>
                        <div class="${cn("tw:text-3xl tw:font-bold", [
													index > 4
														? "tw:text-[#fef99e] tw:[text-shadow:0_0_5px_#fef99e,0_0_10px_#fef99e]"
														: "tw:text-[#7efbf6] tw:[text-shadow:0_0_5px_#7efbf6,0_0_10px_#7efbf6]",
												])}">
						${index + 1}
					</div>
                    </div>
                </div>`,
		position,
	);
	label3d.setLabelStyle(label, 0.01, "x");
	label.setParent(labelGroup);
	return label;
}

export function createMonitoringLabel(
	{ label3d, labelGroup, project }: LabelContext,
	data: MonitoringLabelData,
	{ depth, verticalOffset, valueLabel, valueUnit }: MonitoringLabelOptions,
) {
	const label = label3d.create(
		"",
		cn(
			"tw:bg-[#00000080] tw:text-[#a3dcde] tw:text-sm",
			"tw:w-42.5 tw:h-26.5 tw:pt-4 tw:px-3 tw:mb-7.5",
			"tw:will-change-transform tw:box-content",
		),
		true,
	);
	const [x, y] = project([data.lng, data.lat]);
	label.init(
		` <div class="${cn(
			"tw:before:content-[''] tw:before:block tw:before:size-4",
			"tw:before:border-t tw:before:border-l tw:before:border-solid",
			"tw:before:border-t-[#4b87a6] tw:before:border-l-[#4b87a6]",
			"tw:before:absolute tw:before:top-0 tw:before:left-0",
			"tw:after:content-[''] tw:after:block tw:after:size-4",
			"tw:after:border-t tw:after:border-r tw:after:border-solid",
			"tw:after:border-t-[#4b87a6] tw:after:border-r-[#4b87a6]",
			"tw:after:absolute tw:after:top-0 tw:after:right-0",
		)}">
                    <div class="${cn(
											"tw:before:content-[''] tw:before:block tw:before:size-4",
											"tw:before:border-b tw:before:border-l tw:before:border-solid",
											"tw:before:border-t-[#4b87a6] tw:before:border-l-[#4b87a6]",
											"tw:before:absolute tw:before:bottom-0 tw:before:left-0",
											"tw:after:content-[''] tw:after:block tw:after:size-4",
											"tw:after:border-b tw:after:border-r tw:after:border-solid",
											"tw:after:border-b-[#4b87a6] tw:after:border-r-[#4b87a6]",
											"tw:after:absolute tw:after:bottom-0 tw:after:right-0",
										)}">
                        <div class="tw:absolute tw:top-2 tw:right-3 tw:flex">
					<div class="tw:w-1 tw:h-0.5 tw:mr-1 tw:bg-[#17e5c3]"></div>
                                <div class="tw:w-1 tw:h-0.5 tw:mr-1 tw:bg-[#17e5c3]"></div>
                                <div class="tw:w-1 tw:h-0.5 tw:mr-1 tw:bg-[#17e5c3]"></div>
                        </div>
                        <div>
                                <div class="tw:flex tw:h-7 tw:leading-7 tw:bg-[#232f3a99] tw:mb-1">
						<span class="tw:w-15 tw:pl-2">名称</span>
						<span class="tw:text-white">${data.name}</span>
					</div>
                                <div class="tw:flex tw:h-7 tw:leading-7 tw:bg-[#232f3a99] tw:mb-1">
						<span class="tw:w-15 tw:pl-2">${valueLabel}</span>
						<span class="tw:text-white">${data.value}${valueUnit}</span>
					</div>
                                <div class="tw:flex tw:h-7 tw:leading-7 tw:bg-[#232f3a99] tw:mb-1">
						<span class="tw:w-15 tw:pl-2">等级</span>
						<span class="tw:text-white">${data.level}</span>
					</div>
                        </div>
                    </div>
                    </div>
                `,
		new Vector3(x, -y, depth + verticalOffset),
	);
	label3d.setLabelStyle(label, 0.015, "x");
	label.setParent(labelGroup);
	label.visible = false;
	return label;
}
