var BASE_URL = 'http://kulod.cias.kyoto-u.ac.jp/gitlab/api/v3/projects';
var AUTHORIZE_URL = 'http://kulod.cias.kyoto-u.ac.jp/gitlab/oauth/authorize';
var TOKEN_URL = 'http://kulod.cias.kyoto-u.ac.jp/gitlab/oauth/token';
var EDITOR_URL = 'http://kulod.cias.kyoto-u.ac.jp/json-editor/';
var SEPARATOR = '/';
var URL_PARAM_SEPARATOR_EQUAL = '*eq';
var URL_PARAM_SEPARATOR_AND = '*and';
var URL_PARAM_SLASH = '*slash';
var SCHEME_ID = '3';
var INIT_PROJECT_ID = '-1';
var CLIENT_ID = 'a28b6d0862e2fd03040a2fd96a8c9a9386c9d0b380dc31a8f1eb5d6ab88747e7';
var CLIENT_SECRET = '70ea8da8a6980f5a4f69be9a92d0758f60cd9075a1f35e54ca66ed18721486a1';

var DEFAULT_FILE_NAME = 'ファイル名';

/**
 * ブランチ名
 */
// Schemeリポジトリで使用するブランチ。
var master_branch = 'master';
// Editorリポジトリで使用するブランチ。
var developer_branch = 'developer';

/**
 * URLパラメータ名
 */
var PARAM = 'param';
var CODE = 'code';
var STATE = 'state';
var SCHEMA = 'schema';
var REPOSITORY = 'repository';
var FILE = 'file';
var double_click = false;

var last_commit_id = '';

var ERROR_MESSAGE_401 = '権限がないため、アクセストークンの取得に失敗しました';
var ERROR_MESSAGE_403 = '権限がないため、developerブランチの作成ができませんでした。';

/**
 * アクセストークンなどの変数
 */
var param_list = {
	access_token: null,
	created_at: null,
	refresh_token: null,
	scope: null,
	token_type: null
}

/**
 * URLのパラメータ
 */
var url_param_list = {
	code: null,
	state: null,
	schema: null,
	repository: null,
	file: null
}
/**
 * 画面表示時に呼び出される関数。
 * 実行する処理は以下の通り。
 * 1. URLのパラメータをチェック。
 * 	a. codeとstateの少なくとも片方がnullの場合は、認証前のURLなので、認証ページにリダイレクトする。
 * 	b. codeとstateのどちらもnullでない場合は、認証後のURLなのでアクセストークン取得処理に進む。
 * 2. アクセストークン取得処理。
 * 	a. アクセストークンの取得が成功したら、次の処理に進む。
 * 	b. アクセストークンの取得に失敗したら、アラートを表示して処理を終了。
 * 3. プロジェクト一覧を取得し、selectに追加する。
 * 4. スキーマプロジェクトのファイル一覧を取得し、selectに追加する。
 * 5. URLパラメータにrepository, fileが含まれている場合は、HTMLのパラメータとして格納する。
 */
jQuery(document).ready(function() {
	getURLParameter();
	// parameterにcode、もしくはstateが含まれていない場合はトークンを取得するためにGitLabへリダイレクト
	if(url_param_list.code == null || url_param_list.state == null) {
		if(url_param_list.file != null && url_param_list.repository == null) {
			alert('fileパラメータを指定する場合はrepositoryパラメータも指定してください。');
			return;
		}
		var new_redirect_url =  AUTHORIZE_URL + '?';
		new_redirect_url += 'client_id=' + CLIENT_ID;
		new_redirect_url += '&redirect_uri=' + EDITOR_URL;
		var redirect_param = getRedirectParameter();
		if(redirect_param != '') {
			new_redirect_url += '?param=' + redirect_param;
		}
		new_redirect_url += '&response_type=code';
		new_redirect_url += '&state=' + CLIENT_SECRET;
		location.href = new_redirect_url;
	} else {
		AccessToken.getAccessToken().done(function(json_data) {
			param_list.access_token = json_data['access_token'];
			param_list.created_at = json_data['created_at'];
			param_list.refresh_token = json_data['refresh_token'];
			param_list.scope = json_data['scope'];
			param_list.token_type = json_data['token_type'];

			// プロジェクト一覧を取得しselectボックスのoptionとして追加
			getListProjects();
			// スキーマプロジェクトのファイル一覧を格納
			addSchemeFiles();
			// URLパラメータを保存
			if(url_param_list.repository != null) {
				setTargetFileProject(url_param_list.repository);
			}
			if(url_param_list.file != null) {
				var targetParamFileName = url_param_list.file;
				if(targetParamFileName.indexOf('/') != -1) {
					targetParamFileName = targetParamFileName.slice(targetParamFileName.lastIndexOf('/') + 1);
				}
				setTargetFileName(targetParamFileName);
				setTargetFilePath(url_param_list.file);

				$('#modal-save-as-button').show();
			}
			setTargetFileBranch(developer_branch);
			if(url_param_list.file != null && url_param_list.repository != null) {
				updateContentWithProjectName(url_param_list.repository, url_param_list.file, developer_branch);
			}
		}).fail(function(XMLHttpRequest, textStatus, errorThrown) {
			if(XMLHttpRequest.status == '401') {
				alert(ERROR_MESSAGE_401);
			}
		});
	}
});

/**
 * 画面を更新する。
 */
function refresh() {
	var target_url =  EDITOR_URL;
	var params = '';
	if(url_param_list.repository != null) {
		params += '?repository=' + url_param_list.repository;
	}
	if(url_param_list.file != null) {
		if(params == '') {
			params += '?';
		} else {
			params += '&';
		}
		params += 'file=' + url_param_list.file;
	}
	if(url_param_list.schema != null) {
		if(params == '') {
			params += '?';
		} else {
			params += '&';
		}
		params += 'schema=' + url_param_list.schema;
	}
	target_url += params;
	location.href = target_url;
}

/**
 * URLパラメータの取得。
 * パラメータとして考慮する必要があるのは下記。
 * 	code		: 認証リダイレクト後に追加されているパラメータ。
 * 	state		: 認証リダイレクト後に追加されているパラメータ。
 * 	param		: 認証リダイレクト後のパラメータ。リダイレクト前のschema, repository, fileパラメータを結合したもの。
 * 	schema		: 認証前のパラメータ。
 * 	repository	: 認証前のパラメータ。
 * 	file		: 認証前のパラメータ。
 *
 * 上記のうち、paramはschema、repository、fileを結合したものなので、分割してそれぞれのパラメータを取得する。
 * 取得したパラメータはurl_param_listに格納する。
 */
function getURLParameter() {
	var target_parameter = location.search;
	// target_parameterの1文字目は'?'のため除去
	target_parameter = target_parameter.slice(1);
	// '&'でsplit
	var target_param_array = target_parameter.split('&');
	for(var i = 0; i < target_param_array.length; i++) {
		try {
			var target = target_param_array[i];
			var target_array = target.split('=');

			if(target_array[0] == PARAM) {
				var new_target_param_array = decodeURIComponent(target_array[1]).split(URL_PARAM_SEPARATOR_AND);
				for(var j = 0; j < new_target_param_array.length; j++) {
					var new_target = new_target_param_array[j];
					var new_target_array = new_target.split(URL_PARAM_SEPARATOR_EQUAL);
					if(new_target_array[0] == SCHEMA) {
						url_param_list.schema = new_target_array[1];
					} else if(new_target_array[0] == REPOSITORY) {
						url_param_list.repository = new_target_array[1];
					} else if(new_target_array[0] == FILE) {
						url_param_list.file = new_target_array[1].replace(/(\*slash)/g, '/');
					}
				}
			}
			else if(target_array[0] == CODE) {
				url_param_list.code = target_array[1];
			} else if(target_array[0] == STATE) {
				url_param_list.state = target_array[1];
			} else if(target_array[0] == SCHEMA) {
				url_param_list.schema = target_array[1];
			} else if(target_array[0] == REPOSITORY) {
				url_param_list.repository = target_array[1];
			} else if(target_array[0] == FILE) {
				url_param_list.file = target_array[1].replace(/(\*slash)/g, '/');
			}
		} catch(e) {
			continue;
		}
	}
}

/**
 * リダイレクト用パラメータの取得。
 * URLパラメータとしてscheme, repository, fileが与えられた場合、リダイレクトURLに付与するために結合する。
 *
 * @return: 結合しURLエンコードしたパラメータ
 */

function getRedirectParameter() {
	var result = '';
	if(url_param_list.schema != null) {
		result += SCHEMA + URL_PARAM_SEPARATOR_EQUAL + url_param_list.schema;
	}
	if(url_param_list.repository != null) {
		if(result != '') {
			result += URL_PARAM_SEPARATOR_AND;
		}
		result += REPOSITORY + URL_PARAM_SEPARATOR_EQUAL + url_param_list.repository;
	}
	if(url_param_list.file != null) {
		if(result != '') {
			result += URL_PARAM_SEPARATOR_AND;
		}
		result += FILE + URL_PARAM_SEPARATOR_EQUAL + url_param_list.file.replace(/\u002f/g, '*slash');
	}
	return encodeURIComponent(result);
}


/**
 * アクセストークンの取得
 *
 * @return アクセストークン
 */
var AccessToken = {
	getAccessToken: function() {
		var defer = $.Deferred();
		var redirect_uri = EDITOR_URL;
		var redirect_param = getRedirectParameter();
		if(redirect_param != '') {
			redirect_uri += '?param=' + redirect_param;
		}

		// codeの値が取得できていない場合は処理を終了。
		if(url_param_list.code == null) {
			alert('codeの値を取得できなかったためGitLab APIを使用することができません。');
			return;
		}
		// stateの値が取得できていない場合は処理を終了。
		if(url_param_list.state == null) {
			alert('stateの値を取得できなかったためGitLab APIを使用することができません。');
			return;
		}

		// POSTリクエストを投げてアクセストークンを得る。
		$.ajax({
			url: TOKEN_URL,
			type: 'POST',
			dataType: 'json',
			data: {
				client_id: CLIENT_ID,
				client_secret: CLIENT_SECRET,
				redirect_uri: redirect_uri,
				code: url_param_list.code,
				grant_type: 'authorization_code',
			},
			success: defer.resolve,
			error: defer.reject
		});
		return defer.promise();
	}
};

/**
 * 認証されたユーザの表示可能なプロジェクトをselectに追加する。
 * repositoryパラメータが存在する場合、合致した名前を持つプロジェクトのみ追加する。
 *
 * @param access_token: アクセストークン
 * @return: 結果のJSON
 */
function getListProjects() {
	var target_url = BASE_URL + '?access_token=' + param_list.access_token;
	GitLabAPI.doGitLabAPI(target_url, 'GET').done(function(data) {
		var targetSelect = $('#projectList');
		for(var i in data) {
			if(url_param_list.repository == null || url_param_list.repository == data[i].name) {
				if(data[i].id != SCHEME_ID) {
					var targetOption = $('<option>')
						.val(data[i].id)
						.text(data[i].name);
					if(url_param_list.repository == data[i].name) {
						targetOption.attr('selected', 'selected');
					}
					targetSelect.append(targetOption);
				}
			}
		}
		return data;
	});
}

/**
 * スキーマプロジェクト内にあるファイルをリストとして取得する。
 * 取得するのは最上位階層のファイルのみ。
 *
 * @return 結果のJSON
 */
function addSchemeFiles() {
	var target_url = BASE_URL + SEPARATOR
		+ SCHEME_ID + SEPARATOR
		+ 'repository/tree?access_token=' + url_param_list.access_token;
	GitLabAPI.doGitLabAPI(target_url, 'GET').done(function(data) {
		var targetSelect = $('#schemaList');
		var targetSchemaPath = '';

		var isExistsSchema = false ;
		for(var i in data) {
			var targetOption = $('<option>')
				.val(data[i].path)
				.text(data[i].name);

			if( url_param_list.schema == data[i].name ) {
				targetOption.attr('selected', 'selected');
				isExistsSchema = true ;
			}
			targetSelect.append(targetOption);
		}

		if(isExistsSchema){
			targetSchemaPath = targetSelect.val();
			targetSelect.attr("disabled", "disabled");
		} else if(url_param_list.schema != null) {
			alert("schemaパラメータに指定されたスキーマは存在しません。");
		}

		updateContent(SCHEME_ID, targetSelect.val(), master_branch);

		return data;
	});
}

/**
 * スキーマファイル選択時に呼び出される。
 * 選択したスキーマファイルの内容を取得する。
 */
function selectSchema() {
	var targetFilePath = $('#schemaList option:selected').val();
	updateContent(SCHEME_ID, targetFilePath, master_branch);
}

/**
 * JSON Editor画面表示時に、fileパラメータおよびrepositoryパラメータを持つ場合に呼び出される。
 * repositoryパラメータに設定したプロジェクト名のIDを特定し、Editor画面更新処理を呼び出す。
 */
function updateContentWithProjectName(projectName, file_path, branch) {
	var target_url = BASE_URL + '?access_token=' + param_list.access_token;
	GitLabAPI.doGitLabAPI(target_url, 'GET').done(function(data) {
		var targetProjectId = '';
		for(var i in data) {
			if(data[i].name == projectName) {
				targetProjectId = data[i].id;
			}
		}
		if(targetProjectId == '') {
			alert('repositoryパラメータに指定した値を持つプロジェクトは存在しません。');
			return;
		}
		updateContent(targetProjectId, file_path, branch);
		return data;
	});
}

/**
 * ファイルの内容を取得し、Editor画面を更新する。
 * SchemeProjectの場合、スキーマエリアを更新。
 * 通常Projectの場合、ファイルエリアを更新。
 *
 * @param project_id: 当該ファイルが属するプロジェクトのID
 * @param file_path: 当該ファイルのパス
 * @param branch: 当該ファイルのブランチ
 */
function updateContent(project_id, file_path, branch) {
	var target_url = BASE_URL + SEPARATOR
		+ project_id + SEPARATOR
		+ 'repository/commits/' + branch + '/blob?';
	target_url += 'filepath=' + encodeURIComponent(file_path);
	target_url += '&access_token=' + param_list.access_token;

	if(project_id != SCHEME_ID) {
		var target_url2 = BASE_URL + SEPARATOR
				+ project_id + SEPARATOR
				+ 'repository/files?';
			target_url2 += 'file_path=' +  encodeURIComponent(file_path);
			target_url2 += '&ref=' + branch;
		GitLabAPI.doGitLabAPI(target_url2, 'GET').done(function(data) {
			last_commit_id = data.last_commit_id;
		});
	}

	$.ajax({
		type: 'GET',
		url: target_url,
		dataType: 'text/plain',
		cache : false
	}).always(function(data) {
		var targetText = data.responseText;
		if(typeof targetText != 'undefined' && targetText != null && targetText != '') {
			if(project_id == SCHEME_ID) {
				updateSchemaContent(targetText);
			} else {
				updateFileContent(targetText);
			}
		}
	});
}

function updateFileContent(targetText) {
	// ***** ここからJSON Editorの入力エリアを更新する関数を呼び出す。
	jsonOutput = JSON.parse(targetText);
	jsonDataMap = jsonOutput["json-data"];
	$('#record-select').children().remove();
	for(var i=0, len=jsonDataMap.length; i < len; i++){
		$('#record-select').append($('<option>').val(i).text(i + 1));
	}
	var rec= jsonDataMap[0];
	if(jsonOutput["json-schema"]) $('#schemaList').val(jsonOutput["json-schema"]);
	$('#output').val(JSON.stringify(jsonDataMap[0],null,2));

	var target_url2 = BASE_URL + SEPARATOR
		+ SCHEME_ID + SEPARATOR
		+ 'repository/commits/' + master_branch + '/blob?';
	target_url2 += 'filepath=' + encodeURIComponent(jsonOutput["json-schema"]);
	target_url2 += '&access_token=' + param_list.access_token;
	$.ajax({
		type: 'GET',
		url: target_url2,
		dataType: 'text/plain',
		cache : false
	}).always(function(data) {
		var targetText = data.responseText;
		schema = JSON.parse(targetText);
		$('#schema').val(targetText);
		loadJSON(JSON.stringify(jsonDataMap[0]));
	});

}

function updateSchemaContent(targetText) {
	// **** ここからJSON Editorのスキーマエリアを更新する関数を呼び出す。
	$('#schema').val(targetText);
	schema = JSON.parse(targetText);
	jsonOutput["json-schema"] = $('#schemaList').val();
	reload();
}

function getFileContent() {
	// **** ここからJSON Editorの編集内容を取得する関数を呼び出す。
	// return JSON.stringify(JSON.parse(jsonDataMap),null,"\t");
	jsonOutput["json-data"] = jsonDataMap ;
	return JSON.stringify(jsonOutput,null,"\t");
}

/**
 * 引数として受け取ったURLに対してAjaxを実行する。
 *
 * @param target_url: Ajaxで使用するURL
 * @param type: GET/POST/PUT
 * @return: 結果のJSON
 */
var GitLabAPI = {
	doGitLabAPI: function(target_url, type, data) {
		var defer = $.Deferred();

		switch(type.toLowerCase()) {
			case 'post':
			case 'put':
			case 'del':
				$.ajax({
					type: 'PUT',
					data: JSON.stringify(data),
					contentType: 'application/json',
					url: target_url,
					dataType: 'json',
					cache : false,
					success: defer.resolve,
					error: defer.reject
				});
				break;
			default:
				$.ajax({
					type: type,
					url: target_url,
					dataType: 'json',
					cache : false,
					success: defer.resolve,
					error: defer.reject
				});
				break;
		}
		return defer.promise();
	}
};

/**
 * モーダルウィンドウを開く。
 * 開く際にクリックされたボタンによって処理内容を変更する。
 *
 * @param type: open/save/saveas(開く際にクリックされたボタン)
 */
function modalOpen(type) {
	// モーダルウィンドウのセンタリング
	centeringModalSyncer();
	if($("#modal-overlay")[0]) {
		return false;
	}
	// 暗幕の表示
	$("body").append('<div id="modal-overlay" onClick="javascript:modalClose();"></div>');
	$("#modal-overlay").fadeIn("slow");
	// 対象ファイル名と対象ファイルパスを取得
	var targetFilePath = getTargetFilePathWithoutFileName(getTargetFilePath());
	var targetFileName = getTargetFileName();
	// 「OPEN」ボタンから開いた場合
	if(type == 'open') {
		$('#projectFileName').attr('readonly', 'readonly');
		$('.fileDetail').show();
		$('.modal-open').show();
		$('.modal-save').hide();
		$('#projectList').attr('onChange', "javascript:selectProject('')");
		selectProject(targetFilePath);
		selectFile(targetFileName, getTargetFilePath());
	}
	// 「OPEN」ボタン以外から開いた場合
	else {
		if(type == 'save' && targetFileName != '') {
			$('#projectFileName').attr('readonly', 'readonly');
			$('.fileDetail').hide();
		} else {
			$('#projectFileName').removeAttr('readonly');
			$('.fileDetail').show();
		}
		if(type == 'save') {
			$('#modal-save').attr('onclick', "javascript:modalFileSave('save')");
		} else {
			$('#modal-save').attr('onclick', "javascript:modalFileSave('saveas')");
		}
		$('.modal-open').hide();
		$('.modal-save').show();
		$('#projectList').attr('onChange', "javascript:selectProject('')");
		selectProject(targetFilePath);
		selectFile(targetFileName, getTargetFilePath());
	}
	setProjectFileBranch(getTargetFileBranch());
	// モーダルウィンドウの詳細表示部分をクリアする。
	$("#modal-content").fadeIn("slow");
}

/**
 * モーダルウィンドウを閉じる。
 */
function modalClose() {
	$("#modal-content, #modal-overlay").fadeOut("slow", function() {
		$("#modal-overlay").remove();
	});
}

/**
 * モーダルウィンドウで「OPEN」ボタンがクリックされた場合の処理。
 * ファイルが選択されている場合は、ファイルの情報をHTMLに格納し、
 * JSON-Editor画面の入力ファイル部分を更新する。
 */
function modalFileOpen() {
	var targetFile = getProjectFileName();
	// ファイルが選択されていない場合は処理を終了。
	if(targetFile == '') {
		alert('ファイルを選択してください');
		return;
	}
	var targetFilePath = getProjectFilePath();
	if(targetFilePath != '') {
		targetFilePath = targetFilePath + SEPARATOR + targetFile;
	} else {
		targetFilePath = targetFile;
	}
	// パラメータを保存
	setTargetFileName(targetFile);
	setTargetFilePath(targetFilePath);
	setTargetFileProject($('#projectList option:selected').text());
	setTargetFileBranch(getProjectFileBranch());
	$('#modal-save-as-button').show();
	// 入力ファイル部分の更新
	updateContent(getTargetProjectId(), targetFilePath, developer_branch);
	// モーダルウィンドウを閉じる
	modalClose();
}

/**
 * ファイル名の情報をJSON-Editor画面に格納する。
 *
 * @param targetFileName: 格納するファイル名
 */
function setTargetFileName(targetFileName) {
	$('#targetFileNameShow').val(targetFileName);
	$('#targetFileNameShow').text(targetFileName);
	$('#targetFileName').val(targetFileName);
	$('#targetFileName').text(targetFileName);
}

/**
 * JSON-Editor画面に格納されているファイル名情報を返す。
 *
 * @return: ファイル名
 */
function getTargetFileName() {
	return $('#targetFileName').val();
}

/**
 * ファイルパスの情報をJSON-Editor画面に格納する。
 *
 * @param targetFilePath: 格納するファイルパス
 */
function setTargetFilePath(targetFilePath) {
	$('#targetFilePath').val(targetFilePath);
}

/**
 * JSON-Editor画面に格納されているファイルパス情報を返す。
 *
 * @return: ファイルパス
 */
function getTargetFilePath() {
	return $('#targetFilePath').val();
}

/**
 * 引数として受け取ったファイルパスのファイル名以外の部分を返す。
 *
 * @param targetFilePath: ファイルパス
 * @return: ファイルパスのファイル名以外の部分
 */
function getTargetFilePathWithoutFileName(targetFilePath) {
	if(targetFilePath.indexOf(SEPARATOR) == -1) {
		return '';
	} else {
		return targetFilePath.slice(0, targetFilePath.lastIndexOf(SEPARATOR));
	}
}

/**
 * プロジェクト名の情報をJSON-Editor画面に格納する。
 *
 * @param targetFileProject: 格納するプロジェクト名
 */
function setTargetFileProject(targetFileProject) {
	$('#targetFileProject').val(targetFileProject);
}

/**
 * ブランチ名の情報をJSON-Editor画面に格納する。
 *
 * @param targetFileBranch: 格納するブランチ名
 */
function setTargetFileBranch(targetFileBranch) {
	$('#targetFileBranch').val(targetFileBranch);
}

/**
 * JSON-Editor画面に格納されているブランチ名情報を返す。
 *
 * @return ブランチ名
 */
function getTargetFileBranch() {
	return $('#targetFileBranch').val();
}

/**
 * ファイル名の情報をモーダルウィンドウに格納する。
 *
 * @param projectFileName: 格納するファイル名
 */
function setProjectFileName(projectFileName) {
	$('#projectFileName').val(projectFileName);
}

/**
 * モーダルウィンドウに格納されているファイル名情報を返す。
 *
 * @return ファイル名
 */
function getProjectFileName() {
	return $('#projectFileName').val();
}

function checkProjectFileName(f_name,isSaveAs) {
	var tmp = f_name.split(".");
	var extention = (tmp.length > 1)? tmp[tmp.length - 1 ] : "";
	var f_body = (extention.length > 0)? f_name.substr(0,f_name.length - (extention.length + 1)) : f_name;
	var now = new Date();
	var year = now.getYear(); // 年
	var month = now.getMonth() + 1; // 月
	var day = now.getDate(); // 日
	var hour = now.getHours(); // 時
	var min = now.getMinutes(); // 分
	var sec = now.getSeconds(); // 秒
	if(year < 2000) { year += 1900; }

	// 数値が1桁の場合、頭に0を付けて2桁で表示する指定
	if(month < 10) { month = "0" + month; }
	if(day < 10) { day = "0" + day; }
	if(hour < 10) { hour = "0" + hour; }
	if(min < 10) { min = "0" + min; }
	if(sec < 10) { sec = "0" + sec; }

	var tms = year+month+day+hour+min+sec;

	if(isSaveAs){
		f_body += "_"+ tms;
	}

	var new_name = f_body;
	if(extention.length > 0) new_name += "." + extention;
	//ファイルの拡張子をチェックし、
	if( extention.toLowerCase() != "json" ) {
		new_name += ".json";
	}
	$('#projectFileName').val(new_name);
	return new_name;
}

/**
 * ファイルパスの情報をモーダルウィンドウに格納する。
 *
 * @param projectFilePath: 格納するファイルパス
 */
function setProjectFilePath(projectFilePath) {
	$('#projectFilePath').val('./' + projectFilePath);
}

/**
 * モーダルウィンドウに格納されているファイルパスを返す。
 *
 * @return ファイルパス
 */
function getProjectFilePath() {
	return $('#projectFilePath').val().slice(2);
}

/**
 * ブランチ名の情報をモーダルウィンドウに格納する。
 *
 * @param projectFileBranch: 格納するブランチ名
 */
function setProjectFileBranch(projectFileBranch) {
	$('#projectBranch').val(projectFileBranch);
	$('#projectBranch').text(projectFileBranch);
}

/**
 * モーダルウィンドウに格納されているブランチ名を返す。
 *
 * @return ブランチ名
 */
function getProjectFileBranch() {
	return $('#projectBranch').val();
}

/**
 * モーダルウィンドウで選択されているプロジェクトIDを返す。
 *
 * @return プロジェクトID
 */
function getTargetProjectId() {
	return $('#projectList option:selected').val();
}

/**
 * モーダルウィンドウに入力されているコメントを返す。
 *
 * @return コメント
 */
function getFileComment() {
	return $('#fileComment').val();
}

/**
 * モーダルウィンドウで「SAVE」ボタンがクリックされた場合の処理。
 * コミットに必要な情報がそろっているか確認する。
 * そろっている場合はコミット処理を行う。
 */
function modalFileSave(type) {
	if(double_click == false) {
		double_click = true;
		var targetProjectId = getTargetProjectId();
		if(targetProjectId == '-1') {
			targetProjectId = '';
		}
		var targetCommitMessage = getFileComment();
		var targetContent = getFileContent();
		var targetFilePath = getProjectFilePath();
		var targetFileName = getProjectFileName();

		if(targetFileName == DEFAULT_FILE_NAME) {
			targetFileName = '';
		}
		if(targetFilePath != '') {
			targetFilePath += SEPARATOR + targetFileName;
		} else {
			targetFilePath = targetFileName;
		}

		var targetBranch = getProjectFileBranch();
		// 各種パラメータのチェック
		if(targetProjectId == '') {
			alert('プロジェクトを選択して下さい。');
			double_click = false;
			return;
		}
		// コミットメッセージ
		if(targetCommitMessage == '') {
			alert('Commitメッセージを入力して下さい。');
			double_click = false;
			return;
		}
		if(targetContent == '') {
			alert('ファイルの内容が空です。');
			double_click = false;
			return;
		}
		if(targetFileName == '' || targetFilePath == '') {
			alert('コミット先のファイルを指定して下さい。');
			double_click = false;
			return;
		}
		if(targetBranch == '') {
			alert('ブランチを指定して下さい。');
			double_click = false;
			return;
		}
		if(type == 'save' && $('#projectFileName').attr('readonly') == 'readonly') {

			var check_exists_url = BASE_URL + SEPARATOR
				+ targetProjectId + SEPARATOR
				+ 'repository/files?'
				+ 'file_path=' +  encodeURIComponent(targetFileName)
				+ '&ref=' + targetBranch ;

			GitLabAPI.doGitLabAPI(check_exists_url, 'GET').done(function(data) {

				if(data.last_commit_id !== last_commit_id ){
					alert("コミットIDが変更されているため、別名保存します。");
					targetFileName = checkProjectFileName(targetFileName,true);
				}
				else {
					targetFileName = checkProjectFileName(targetFileName,false);
				}

				var new_fpath = getProjectFilePath();
				if(new_fpath != '') {
					new_fpath += SEPARATOR + targetFileName;
				} else {
					new_fpath = targetFileName;
				}

				var target_url = BASE_URL + SEPARATOR
					+ targetProjectId + SEPARATOR
					+ 'repository/files';
				var params = {
					file_path: new_fpath,
					branch_name: targetBranch,
					content: getFileContent(),
					commit_message: targetCommitMessage,
					encode: 'text',
					access_token: param_list.access_token
				};

				GitLabAPI.doGitLabAPI(target_url, 'PUT', params).done(function(data) {
					alert('コミットが完了しました。');

					var get_file_info_url = BASE_URL + SEPARATOR
						+ targetProjectId + SEPARATOR
						+ 'repository/files?';
						+ 'file_path=' +  encodeURIComponent(data.file_path);
						+ '&ref=' + data.branch_name;

					GitLabAPI.doGitLabAPI(get_file_info_url, 'GET').done(function(data) {
						last_commit_id = data.last_commit_id;
					});

					modalClose();
					// パラメータを保存
					setTargetFileName(targetFileName);
					setTargetFilePath(targetFilePath);
					double_click = false;
					return data;
				})
				.fail(function(data) {
					alert("コミット処理に失敗しました。");
				});
			})
			.fail(function(data) {

				targetFileName = checkProjectFileName(targetFileName,false);
				var new_fpath = getProjectFilePath();
				if(new_fpath != '') {
					new_fpath += SEPARATOR + targetFileName;
				}
				else {
					new_fpath = targetFileName;
				}
				var target_url = BASE_URL + SEPARATOR
					+ targetProjectId + SEPARATOR
					+ 'repository/files';
				var params = {
					file_path: new_fpath,
					branch_name: targetBranch,
					content: getFileContent(),
					commit_message: targetCommitMessage,
					encode: 'text',
					access_token: param_list.access_token
				};
				GitLabAPI.doGitLabAPI(target_url, 'PUT', params).done(function(data) {
					alert('コミットが完了しました。');
					modalClose();
					// パラメータを保存
					setTargetFileName(targetFileName);
					setTargetFilePath(targetFilePath);
					double_click = false;
					return data;
				})
				.fail(function(data) {
					alert("コミット処理に失敗しました。");
				});
			});
		} else {
			var check_exists_url = BASE_URL + SEPARATOR
				+ targetProjectId + SEPARATOR
				+ 'repository/files?';
				+ 'file_path=' + targetFilePath;
				+ '&ref=' + targetBranch ;
			GitLabAPI.doGitLabAPI(check_exists_url, 'GET').done(function(data) {
				alert('同名のファイルが存在します。');
				return data;
			}).fail(function(data) {
				var target_url = BASE_URL + SEPARATOR
					+ targetProjectId + SEPARATOR
					+ 'repository/files';

				targetFileName = checkProjectFileName(targetFileName,false);
				var new_fpath = getProjectFilePath();
				if(new_fpath != '') {
					new_fpath += SEPARATOR + targetFileName;
				}
				else {
					new_fpath = targetFileName;
				}

				var params = {
					file_path: new_fpath,
					branch_name: targetBranch,
					content: getFileContent(),
					commit_message: targetCommitMessage,
					encode: 'text',
					access_token: param_list.access_token
				};

				GitLabAPI.doGitLabAPI(target_url, 'PUT', params).done(function(data) {
					alert('コミットが完了しました。');
					modalClose();

					// パラメータを保存
					setTargetFileName(targetFileName);
					setTargetFilePath(targetFilePath);
					$('#modal-save-as-button').show();

					double_click = false;
					return data;
				})
				.fail(function(data) {
					alert("コミット処理に失敗しました。");
				});
			});
		}
		double_click = false;
	}
}

/**
 * モーダルウィンドウのセンタリング処理を行う。
 */
function centeringModalSyncer() {
	var targetModalContentId;
	targetModalContentId = "#modal-content";
	// 画面（ウィンドウ）の幅を取得し、変数wに格納
	var w = $(window).width();
	// 画面（ウィンドウ）の高さを取得し、変数hに格納
	var h = $(window).height();
	// コンテンツ(#modal-content)の幅を取得し、変数cwに格納
	var cw = $(targetModalContentId).outerWidth();
	// コンテンツ(#modal-content)の高さを取得し、変数chに格納
	var ch = $(targetModalContentId).outerHeight();

	// コンテンツ(#modal-content)を真ん中に配置するために、
	// 左から何ピクセル離すかを計算して変数pxleftに格納
	var pxleft = ((w - cw) / 2);

	// コンテンツ(#modal-content)を真ん中に配置するために、
	// 上から何ピクセル離すかを計算して変数pxtopに格納
	var pxtop = ((h - ch) / 6);

	// CSSにpxleftとpxtopを設定
	$(targetModalContentId).css({"left": pxleft + "px"});
	$(targetModalContentId).css({"top": "10px"});
}

/**
 * プロジェクトが選択された場合、もしくは選択ディレクトリが変更された場合に呼び出される処理。
 * 選択されたプロジェクトにdeveloperブランチが存在するか確認し、
 * ブランチが存在しない場合はmasterブランチから作成する。
 * その後、selectProjectExecute処理を呼び出す。
 *
 * @param targetPath: 選択されたディレクトリ。プロジェクト選択の場合は空の文字列。
 */
function selectProject(targetPath) {
	var project_id = getTargetProjectId();
	if(project_id == INIT_PROJECT_ID) {
		return;
	}
	// developerブランチの存在確認。
	var target_url = BASE_URL + SEPARATOR + project_id + SEPARATOR;
	target_url += 'repository/branches/' + developer_branch + '?access_token=' + param_list.access_token;
	GitLabAPI.doGitLabAPI(target_url, 'GET').done(function(data) {
		selectProjectExecute(targetPath);
		return data;
	}).fail(function(data) {
		target_url = BASE_URL + SEPARATOR + project_id + SEPARATOR;
		target_url += 'repository/branches';
		target_url += '?branch_name=' + developer_branch;
		target_url += '&ref=' + master_branch;
		target_url += '&access_token=' + param_list.access_token;
		GitLabAPI.doGitLabAPI(target_url, 'POST').done(function(data) {
			selectProjectExecute(targetPath);
		}).fail(function(XMLHttpRequest, textStatus, errorThrown) {
			if(XMLHttpRequest.status == '403') {
				alert(ERROR_MESSAGE_403);
				$('.file-table-content').remove();
			}
		}).always(function(data) {
			return data;
		});
	});
}

/**
 * プロジェクトが選択された場合、もしくは選択ディレクトリが変更された場合に呼び出される実処理。
 * 選択されたプロジェクト、もしくはディレクトリに格納されているファイルの情報を取得し
 * リストとして表示する。
 *
 * @param targetPath: 選択されたディレクトリ。プロジェクト選択の場合は空の文字列。
 */
function selectProjectExecute(targetPath) {
	var project_id = getTargetProjectId();
	if(project_id == INIT_PROJECT_ID) {
		return;
	}
	var branch = getTargetFileBranch();


	target_url = BASE_URL + SEPARATOR
		+ project_id + SEPARATOR
		+ 'repository/tree?';
	if(targetPath != '') {
		target_url += 'path=' + encodeURIComponent(targetPath) + '&';
	}
	if(branch != '') {
		target_url += 'ref_name=' + branch + '&';
	}
	target_url += 'access_token=' + param_list.access_token;
	if(double_click == false) {
		double_click = true;
	GitLabAPI.doGitLabAPI(target_url, 'GET').done(function(data) {
		$('.file-table-content').remove();
		// 上位に戻るリンクの作成
		if(targetPath != '') {
			var prevPath = getTargetFilePathWithoutFileName(targetPath);
			var fileDetailHtml = '<tr class="file-table-content" onClick="javascript:selectProject(\'' + prevPath + '\')">';
			fileDetailHtml += '<td>';
			fileDetailHtml += '<i class="fa fa-level-up" area-hidden="true"></i><span class="fileName">..</span></td>';
			fileDetailHtml += '<td></td><td></td>';
			fileDetailHtml += '</tr>';
			$('#fileList tbody > tr:last').after(fileDetailHtml);
		}
		// 現在のディレクトリの保存
		setProjectFilePath(targetPath);
		$('#projectDirectory').val('./' + targetPath);
		// ファイルリストの作成
		showFileDetail(data, 0, targetPath);
	});
	}
}

/**
 * ファイルが選択された場合に呼び出される処理。
 *
 * @param targetFile: 選択されたファイル名
 * @param targetFilePath: 選択されたファイルのパス。
 */
function selectFile(targetFile, targetFilePath){
	setProjectFileName(targetFile);
	targetFilePath = getTargetFilePathWithoutFileName(targetFilePath);
	setProjectFilePath(targetFilePath);
}

/**
 * モーダルウィンドウにてファイルの詳細情報を表示する。
 *
 * @param targetFilePath: 対象となるファイルのパス。
 */
function showFileDetail(data, i, targetPath) {
	var fileDetailHtml = '';
	if(data[i].type == 'tree') {
		if(url_param_list.file == null || url_param_list.file.indexOf(data[i].path) != -1) {
			fileDetailHtml += '<tr class="file-table-content filetype-tree" onClick="javascript:selectProject(\'' + data[i].path + '\')">';
			fileDetailHtml += '<td><i class="fa fa-folder" aria-hidden="true"></i>';
			fileDetailHtml += '<span class="fileName">' + data[i].name + '</span></td>';
			fileDetailHtml += '<td></td><td></td>';
			// fileDetailHtml += selectFile(data[i].name, data[i].path);
			fileDetailHtml += '</tr>';
			$('#fileList tbody > tr:last').after(fileDetailHtml);
			if(i + 1 < data.length) {
				showFileDetail(data, i + 1, targetPath);
			} else {
				double_click = false;
			}
		}
	} else {
		if(url_param_list.file == null || url_param_list.file == data[i].path) {
			var targetFileName = data[i].name;
			var targetFilePath = data[i].path;

			var deffered = new $.Deferred();
			var project_id = getTargetProjectId();
			var access_token = param_list.access_token;
			var target_url = BASE_URL + SEPARATOR
				+ project_id + SEPARATOR
				+ 'repository/files?file_path=' + encodeURIComponent(targetFilePath)
				+ '&ref=' + developer_branch
				+ '&access_token=' + access_token;
			GitLabAPI.doGitLabAPI(target_url, 'GET').done(function(new_data) {
				target_url = BASE_URL + SEPARATOR
					+ project_id + SEPARATOR
					+ 'repository/commits/' + new_data.last_commit_id
					+ '?access_token=' + access_token;
				GitLabAPI.doGitLabAPI(target_url, 'GET').done(function(new_data) {
					var fileDetailHtml = '<tr class="file-table-content filetype-blob" onClick="javascript:selectFile(\'' + targetFileName + '\',\'' + targetFilePath + '\')">';
					fileDetailHtml += '<td><i class="fa fa-file-o" aria-hidden="true"></i>';
					fileDetailHtml += '<span class="fileName">' + targetFileName + '</span></td>';
					fileDetailHtml +=  "<td>" + new_data.message + "</td><td>" + new_data.committed_date.split('.')[0] + "</td></tr>";
					$('#fileList tbody > tr:last').after(fileDetailHtml);
				}).fail(function() {
					console.log('ファイル情報の取得に失敗しました。');
				}).always(function() {
					if(i + 1 < data.length) {
						showFileDetail(data, i + 1, targetPath);
					} else {
						double_click = false;
					}
				});
			});
		}
	}
	double_click = false;
}
