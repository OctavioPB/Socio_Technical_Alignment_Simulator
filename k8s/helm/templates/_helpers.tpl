{{/*
Common labels
*/}}
{{- define "stas.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels for a given component
*/}}
{{- define "stas.selectorLabels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .release }}
{{- end }}

{{/*
Full image reference
*/}}
{{- define "stas.image" -}}
{{ .Values.global.imageRegistry }}/{{ .imageName }}:{{ .Values.global.imageTag }}
{{- end }}
