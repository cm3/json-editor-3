var suggestAPI = function(element) {
    /**
     * 設定エリア
    */
    // ===============================
    // サジェスト件数
    var limit = 5;
    // 入力後の待機時間(ms)
    var dtime = 500;
    // suggest結果の項目名
    var colmn=[];
    // ===============================

	$("input[suggestAPI]").autocomplete({
		source: function(req,res){
			// エスケープ処理
			//var term = escapeHtml(req.term);
			var term = req.term;
			var encode_term = encodeURIComponent(term);
			var termlist = [];
			var $target_elm = this.element[0];
			var elm_name = $target_elm.name;
			var name_array = elm_name.match(/\[([^\[\s]+)\]/g);
			var e_name_len = name_array && name_array.length;
			var prop_name = name_array[ e_name_len - 1 ].replace("[","").replace("]","");
			var parent_name = elm_name.substring(0,elm_name.lastIndexOf("["));
			// サジェストの件数
			var query = $($target_elm).attr('suggestAPI').replace(/\{\{keyword\}\}/g,encode_term);
			$.ajax({
				url: query,
				dataType: "json"
			}).then(
				//成功時
				function(data){
					arr = data.results.bindings;
					colmn = data.head.vars;
					termlist.push({label:"『"+term+"』",value:term});
					for(var i=0, len = arr.length; i<len && i<100; i++){
						if(typeof arr[0][prop_name] === "undefined") prop_name = "o";

						var recordArray = {};
						var _label = "『" + arr[i][prop_name].value +"』" ;
						recordArray["value"] = arr[i][prop_name].value;

						for(var j=0, leng=colmn.length; j<leng; j++ ){
							if(colmn[j] != prop_name) _label += " " + colmn[j] + ":["+arr[i][colmn[j]].value+"]";
							recordArray["__"+colmn[j]] = arr[i][colmn[j]].value;
						}
						recordArray["label"] = _label;
						termlist.push(recordArray);
					}
					res(termlist);
				},
				//失敗時
				function(){
					console.log("[error] ajax error");
					alert( 'Suggest (SPARQL) error.');
				}
			)
		},
		autoFocus: true,
		delay: dtime,
		minLength: 1,
		select:function(eve,data){
			var target_name = eve.target.name;
			var parent_name = target_name.substring(0,target_name.lastIndexOf("["));
			for(var i=0, leng=colmn.length; i<leng; i++ ){
				//var f_name = parent_name + '['+ colmn[i] +']";
				$('input[name="'+ parent_name + '['+ colmn[i] +']"]').val(data.item["__"+colmn[i]]);
				var obj = $('input[name="'+ parent_name + '['+ colmn[i] +']"]');
				obj[0].dispatchEvent(new CustomEvent("change"));
			}
		}
	});
};

function escapeHtml(str) {
    str = str.replace(/&/g, encodeURIComponent('&'));
    str = str.replace(/</g, encodeURIComponent('<'));
    str = str.replace(/>/g, encodeURIComponent('>'));
    str = str.replace(/"/g,"");
    str = str.replace(/'/g, encodeURIComponent("'"));
    return str;
}
